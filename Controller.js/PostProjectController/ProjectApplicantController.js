import PostProjectModel from "../../Model/PostProjectModel.js";
import UserModel from "../../Model/UserModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import mongoose from "mongoose";
import { redisClient } from "../../server.js";
import { sendHiredEmail, sendApplicationDecisionEmail } from "../../services/EmailService.js";

export const getApplicantsForMyProjects = async (req, res) => {
  try {
    const myProjects = await PostProjectModel.find({ client: req.user.id });
    const projectIds = myProjects.map(p => p._id);
    const applications = await ProjectApplyModel.find({ project: { $in: projectIds } })
      .populate("project", "title description budget")
      .populate("user", "username email totalEarnings profileImage completedProjects rating")
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, totalApplications: applications.length, data: applications });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getApplicantsForProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await PostProjectModel.findOne({ _id: projectId, client: req.user.id });
    if (!project) return res.status(404).json({ success: false, message: "Denied" });

    const applicants = await ProjectApplyModel.find({ project: projectId }).populate({
        path: "user",
        select: "username email profileImage completedProjects rating plan maxProjectPerDay socialLinks availability lastSeen location",
    }).lean();

    const TeamHubModel = mongoose.model("TeamHub");
    const userIds = applicants.map(app => app.user?._id).filter(id => id);
    
    // Fetch active teams for these users
    const teams = await TeamHubModel.find({
      "members.user": { $in: userIds },
      isActive: true
    }).select("name members logo");

    const PlanPurchaseModel = mongoose.model("PlanPurchase");
    const activePlans = await PlanPurchaseModel.find({
      user: { $in: userIds },
      status: "approved",
      endDate: { $gte: new Date() }
    }).populate("plan");

    const userPlanMap = {};
    const userTeamMap = {};

    activePlans.forEach(p => { userPlanMap[p.user] = p; });
    
    // Map users to their teams
    teams.forEach(team => {
      team.members.forEach(member => {
        const uId = member.user.toString();
        if (userIds.some(id => id.toString() === uId)) {
          if (!userTeamMap[uId]) userTeamMap[uId] = [];
          userTeamMap[uId].push({
            _id: team._id,
            name: team.name,
            logo: team.logo,
            role: member.role
          });
        }
      });
    });

    const applicantsWithPlan = applicants.map(app => {
      if (!app.user) return app;
      
      const userId = app.user._id.toString();
      return {
      ...app,
      user: {
        ...app.user,
        teams: userTeamMap[userId] || []
      },
      IsPlanActive: userPlanMap[userId] ? { ...userPlanMap[userId].toObject(), name: userPlanMap[userId].plan?.name } : null
      };
    });

    const sorted = applicantsWithPlan.sort((a, b) => {
      // 1. Membership priority
      if (!!a.IsPlanActive && !b.IsPlanActive) return -1;
      if (!a.IsPlanActive && !!b.IsPlanActive) return 1;
      
      // 2. First Come First Serve (appliedAt ascending)
      const dateA = new Date(a.appliedAt || a.createdAt);
      const dateB = new Date(b.appliedAt || b.createdAt);
      return dateA - dateB;
    });

    return res.status(200).json({ success: true, data: sorted });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const updateApplicationStatus = async (req, res) => {
  try {
    const { status, feedback } = req.body;
    const { applicationId } = req.params;

    const application = await ProjectApplyModel.findById(applicationId).populate("user").populate("project");
    if (!application) return res.status(404).json({ success: false, message: "Not found" });

    application.status = status;
    if (feedback) application.feedback = feedback;
    await application.save();

    if (status === "hired") {
      await PostProjectModel.findByIdAndUpdate(application.project._id, { status: "in-progress" });
      try { await sendHiredEmail(application.user, application.project, `https://ferora.netlify.app/Fworkk/user/dashboard/client/projectdetail/${application.project._id}`, feedback); } catch (e) {}
    } else if (status === "rejected") {
      try { await sendApplicationDecisionEmail(application.user, application.project, "rejected", feedback); } catch (e) {}
    }

    // Cache clearing logic
    await redisClient.del(`get-single-job:${application.project._id}`);

    return res.status(200).json({ success: true, data: application });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getApplicantDetails = async (req, res) => {
  try {
    const user = await UserModel.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "Not found" });
    return res.status(200).json({ success: true, data: user });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getRecommendedApplicants = async (req, res) => {
  try {
    const { projectId } = req.params;
    const project = await PostProjectModel.findById(projectId);
    if (!project) return res.status(404).json({ success: false, message: "Not found" });

    const applicants = await ProjectApplyModel.find({ project: projectId }).populate("user").populate("IsPlanActive");
    if (!applicants.length) return res.status(200).json({ success: true, data: [] });

    const scored = applicants.map(app => {
      let score = 0;
      const user = app.user;
      const matchingSkills = (project.skillsRequired || []).filter(s => (user.skills || []).some(us => us.toLowerCase().includes(s.toLowerCase())));
      score += (matchingSkills.length / (project.skillsRequired?.length || 1)) * 40;
      score += Math.min((user.completedProjects || 0) * 2, 20); // max 20 for 10 projects
      score += (user.rating || 0) * 3; // max 15 for 5 rating
      if (app.IsPlanActive?.status === "approved") score += 10;
      return { ...app.toObject(), recommendationScore: Math.round(score), matchingSkills };
    });

    return res.status(200).json({ success: true, data: scored.sort((a, b) => b.recommendationScore - a.recommendationScore) });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const hireFromTalentFinder = async (req, res) => {
  try {
    const { projectId, freelancerId } = req.body;
    const project = await PostProjectModel.findOne({ _id: projectId, client: req.user.id });
    if (!project) return res.status(404).json({ success: false });

    if (await ProjectApplyModel.findOne({ project: projectId, status: "hired" })) return res.status(400).json({ success: false, message: "Already hired" });

    const freelancer = await UserModel.findById(freelancerId);
    let app = await ProjectApplyModel.findOne({ project: projectId, user: freelancerId });

    if (app) {
      app.status = "hired"; await app.save();
    } else {
      app = await ProjectApplyModel.create({ user: freelancerId, project: projectId, status: "hired", source: "client_invite", description: "Direct hire" });
    }

    await PostProjectModel.findByIdAndUpdate(projectId, { status: "in-progress" });
    try { await sendHiredEmail(freelancer, project, `https://ferora.netlify.app/Fworkk/user/dashboard/client/projectdetail/${projectId}`); } catch (e) {}

    return res.status(200).json({ success: true, data: app });
  } catch (error) { return res.status(500).json({ success: false, error: error.message }); }
};
