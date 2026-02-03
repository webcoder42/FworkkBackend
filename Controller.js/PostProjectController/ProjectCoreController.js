import PostProjectModel from "../../Model/PostProjectModel.js";
import UserModel from "../../Model/UserModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import Transaction from "../../Model/TransactionModel.js";
import SiteSettings from "../../Model/SiteSettingsModel.js";
import SubmitProjectModel from "../../Model/SubmitProjectModel.js";
import MessageModel from "../../Model/MessageModel.js";
import { 
    sendEarningUpdateEmail, 
    sendProjectHoldEmail, 
    sendProjectCancellationEmailToFreelancer 
} from "../../services/EmailService.js";
import { ioGlobal } from "../MessageController.js";
import { 
    containsInappropriateContent, 
    containsContactDetails, 
    handleInappropriateContentViolation,
    clearProjectCache 
} from "./ProjectHelper.js";

export const createJobPost = async (req, res) => {
  try {
    if (!req.user?.id) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { title, description, experience, problems, bonus, budget, category, skillsRequired, deadline } = req.body;

    if (!title || !description || !experience || !problems || !budget || !category || !skillsRequired || !deadline) {
      return res.status(400).json({ success: false, message: "All fields required" });
    }

    // Validation
    for (const field of ["title", "description", "problems"]) {
        if (containsInappropriateContent(req.body[field])) {
            const violation = await handleInappropriateContentViolation(req.user.id, req.body[field], `Violation in ${field}`);
            if (violation.suspended) return res.status(403).json({ success: false, message: "Suspended", forceLogout: true });
            return res.status(400).json({ success: false, message: `Inappropriate content in ${field}`, isWarning: true, warningCount: violation.warningCount });
        }
    }

    const user = await UserModel.findById(req.user.id);
    const requestedBudget = Number(budget);
    if (user.totalEarnings < requestedBudget) return res.status(400).json({ success: false, message: "Insufficient balance" });

    const settings = await SiteSettings.findOne();
    const tax = settings?.postProjectTax || 10;
    const serviceCharge = (requestedBudget * tax) / 100;
    const finalBudget = requestedBudget - serviceCharge;

    const newJob = new PostProjectModel({
      client: req.user.id, title, description, experience, problems, bonus, budget: finalBudget,
      category, skillsRequired: Array.isArray(skillsRequired) ? skillsRequired : [skillsRequired],
      deadline: new Date(deadline),
      status: (containsContactDetails(title) || containsContactDetails(description) || containsContactDetails(problems)) ? "hold" : "open",
    });

    const savedJob = await newJob.save();

    if (savedJob.status === "hold") {
        try { await sendProjectHoldEmail(user, savedJob); } catch (e) {}
    }

    user.totalEarnings -= requestedBudget;
    user.totalSpend += requestedBudget;
    user.EarningLogs.push({ amount: -requestedBudget, date: new Date(), reason: `Project creation budget deduction: ${title}` });
    await user.save();

    await Transaction.create({
      user: user._id, type: "debit", amount: requestedBudget, balanceAfter: user.totalEarnings,
      category: "project_creation", projectId: savedJob._id, description: `Budget locked for project: ${title}`,
      taxAmount: serviceCharge, taxPercent: tax, grossAmount: requestedBudget,
    });

    await sendEarningUpdateEmail(user.email, user.username || user.Fullname, requestedBudget, 'decrement', `Budget deduction for: "${title}"`);

    // Referral earning
    if (user.referredBy) {
      const referrer = await UserModel.findById(user.referredBy);
      if (referrer) {
        referrer.totalEarnings += 1;
        referrer.EarningLogs.push({ amount: 1, date: new Date(), reason: `Referral earning from user ${user._id} project post` });
        await referrer.save();
      }
    }

    await clearProjectCache(req.user.id);
    
    // VIP update dynamic import
    const { checkAndUpdateVIPStatus } = await import("../VIPController.js");
    await checkAndUpdateVIPStatus(req.user.id);

    return res.status(201).json({ success: true, message: "Created", data: savedJob, serviceCharge, finalBudgetForJob: finalBudget });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal error" });
  }
};

export const updateJobPost = async (req, res) => {
  try {
    const job = await PostProjectModel.findById(req.params.id);
    if (!job || !job.client.equals(req.user.id)) return res.status(403).json({ success: false, message: "Forbidden" });

    const updates = req.body;
    const user = await UserModel.findById(req.user.id);

    if (updates.budget) {
        const newBudget = Number(updates.budget);
        const oldBudget = job.budget;
        if (newBudget > oldBudget) {
            const extra = newBudget - oldBudget;
            if (user.totalEarnings < extra) return res.status(400).json({ success: false, message: "Insufficient balance" });
            user.totalEarnings -= extra;
            user.totalSpend += extra;
            user.EarningLogs.push({ amount: -extra, date: new Date(), reason: `Project budget increase: ${job.title}` });
            await user.save();
            await sendEarningUpdateEmail(user.email, user.username || user.Fullname, extra, 'decrement', `Budget increase for: "${job.title}"`);
        }
        job.budget = newBudget;
    }

    if (updates.status === "cancelled" && job.status !== "cancelled") {
        const refund = (job.budget * 90) / 100;
        user.totalEarnings += refund;
        user.EarningLogs.push({ amount: refund, date: new Date(), reason: `Refund: Project "${job.title}" cancelled` });
        await user.save();
        await sendEarningUpdateEmail(user.email, user.username || user.Fullname, refund, 'increment', `Refund for cancelled project: "${job.title}"`);
        
        const hiredApp = await ProjectApplyModel.findOne({ project: job._id, status: "hired" }).populate("user");
        if (hiredApp) {
            await sendProjectCancellationEmailToFreelancer(hiredApp.user, job);
            if (ioGlobal) ioGlobal.to(hiredApp.user._id.toString()).emit("projectCancelled", { title: "Cancelled", message: `Project "${job.title}" cancelled`, projectId: job._id });
            hiredApp.status = "cancelled";
            await hiredApp.save();
        }
    }

    Object.keys(updates).forEach(key => {
        if (!["_id", "client", "budget"].includes(key)) job[key] = updates[key];
    });

    const hasContact = containsContactDetails(job.title) || containsContactDetails(job.description) || containsContactDetails(job.problems);
    if (hasContact) job.status = "hold";
    else if (job.status === "hold") job.status = "open";

    const updatedJob = await job.save();
    if (hasContact) await sendProjectHoldEmail(user, updatedJob);

    await clearProjectCache(req.user.id);
    return res.status(200).json({ success: true, message: "Updated", data: updatedJob });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const deleteJobPost = async (req, res) => {
  try {
    const job = await PostProjectModel.findById(req.params.id);
    if (!job || job.client.toString() !== req.user.id) return res.status(403).json({ success: false, message: "Forbidden" });

    if (job.status !== "completed") {
      const user = await UserModel.findById(req.user.id);
      const refund = (job.budget * 90) / 100;
      user.totalEarnings += refund;
      await user.save();
    }

    await job.deleteOne();
    await clearProjectCache(req.user.id);
    return res.status(200).json({ success: true, message: "Deleted" });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const cancelJobPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description } = req.body;
    const userId = req.user.id;

    const job = await PostProjectModel.findById(id);
    if (!job || job.client.toString() !== userId.toString()) return res.status(403).json({ success: false, message: "Unauthorized" });
    if (job.status === "cancelled" || job.status === "completed") return res.status(400).json({ success: false, message: "Cannot cancel" });

    const user = await UserModel.findById(userId);
    const refund = job.budget * 0.98;

    if (job.status === "open" || job.status === "hold") {
      job.status = "cancelled";
      job.cancellationReason = reason;
      await job.save();
      user.totalEarnings += refund;
      user.EarningLogs.push({ amount: refund, date: new Date(), reason: `Refund: Cancelled project "${job.title}"` });
      await user.save();
      await sendEarningUpdateEmail(user.email, user.username || user.Fullname, refund, "increment", `Refund for: "${job.title}"`);
      await clearProjectCache(userId);
      return res.status(200).json({ success: true, message: "Cancelled and refunded" });
    }

    if (job.status === "in-progress" || job.status === "hired") {
      const hiredApp = await ProjectApplyModel.findOne({ project: id, status: { $in: ["hired", "in-progress"] } }).populate("user");
      if (!hiredApp) {
          job.status = "cancelled"; await job.save();
          user.totalEarnings += refund; await user.save();
          return res.status(200).json({ success: true, message: "Cancelled." });
      }

      const freelancer = hiredApp.user;
      let approved = false;
      let aiMessage = "Criteria not met.";

      if (reason === "Freelancer not responding") {
        const lastMsg = await MessageModel.findOne({ sender: freelancer._id, receiver: userId }).sort({ createdAt: -1 });
        if (!lastMsg || (Date.now() - new Date(lastMsg.createdAt).getTime()) / 3600000 > 24) approved = true;
        else aiMessage = "Freelancer replied within 24h.";
      } else if (reason === "Not delivered work") {
        if (new Date() > new Date(job.deadline) && (await SubmitProjectModel.countDocuments({ project: id })) === 0) approved = true;
        else aiMessage = "Deadline not passed or work submitted.";
      } else if (reason === "Poor quality") {
         if (await SubmitProjectModel.findOne({ project: id, status: "rejected" })) approved = true;
         else aiMessage = "Must reject submission first.";
      } else {
          if (new Date() > new Date(job.deadline)) approved = true;
          else aiMessage = "Contact support for other reasons.";
      }

      if (approved) {
         job.status = "cancelled"; await job.save();
         hiredApp.status = "cancelled"; await hiredApp.save();
         user.totalEarnings += refund;
         user.EarningLogs.push({ amount: refund, date: new Date(), reason: `Refund: Cancelled project "${job.title}"` });
         await user.save();
         try { await sendProjectCancellationEmailToFreelancer(freelancer, job, reason); } catch (e) {}
         await clearProjectCache(userId);
         return res.status(200).json({ success: true, message: "Cancelled after verification." });
      }
      return res.status(400).json({ success: false, message: aiMessage });
    }
    return res.status(400).json({ success: false, message: "Invalid status" });
  } catch (error) { return res.status(500).json({ success: false, message: "Internal error" }); }
};
