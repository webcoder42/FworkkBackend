import PostProjectModel from "../../Model/PostProjectModel.js";
import UserModel from "../../Model/UserModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import SubmitProjectModel from "../../Model/SubmitProjectModel.js";
import MessageModel from "../../Model/MessageModel.js";
import { redisClient } from "../../server.js";
import { sendWorkUpdateSubmittedEmail } from "../../services/EmailService.js";

export const getMyJobPosts = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `my-post-job:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const jobs = await PostProjectModel.find({ client: userId }).populate("client", "username email").sort({ createdAt: -1 }).lean();
    if (!jobs.length) return res.status(200).json({ success: true, data: [] });

    const jobIds = jobs.map(j => j._id);
    const applicantCounts = await ProjectApplyModel.aggregate([{ $match: { project: { $in: jobIds } } }, { $group: { _id: "$project", count: { $sum: 1 } } }]);
    const countsMap = new Map(applicantCounts.map(c => [c._id.toString(), c.count]));

    const submissions = await SubmitProjectModel.find({ project: { $in: jobIds } }).lean();
    const subMap = new Map(submissions.map(s => [s.project.toString(), s]));

    const enriched = jobs.map(j => ({
      ...j,
      applicantsCount: countsMap.get(j._id.toString()) || 0,
      hasSubmission: subMap.has(j._id.toString()),
      submission: subMap.get(j._id.toString()) || null,
      unseenUpdatesCount: (j.dailyWorkUpdates || []).filter(u => !u.isSeen).length
    }));

    const response = { success: true, data: enriched };
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    return res.status(200).json(response);
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getMyJobs = async (req, res) => {
  try {
    const jobs = await PostProjectModel.find({ client: req.user.id }).sort({ createdAt: -1 }).lean();
    const enriched = await Promise.all(jobs.map(async job => {
      const sub = await SubmitProjectModel.findOne({ project: job._id });
      return { ...job, hasSubmission: !!sub };
    }));
    return res.status(200).json({ success: true, data: enriched });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const submitDailyWorkUpdate = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { description } = req.body;
    const project = await PostProjectModel.findById(projectId).populate("client");
    if (!project) return res.status(404).json({ success: false });

    const imageUrls = [];
    if (req.files?.length > 0) {
      const { uploadImageToCloudinary } = await import("../../services/cloudinaryService.js");
      for (const file of req.files) {
        const result = await uploadImageToCloudinary({ buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype }, 'daily-work-updates');
        imageUrls.push(result.url);
      }
    }

    const newUpdate = { date: new Date(), description, images: imageUrls, createdAt: new Date(), isSeen: false };
    project.dailyWorkUpdates.push(newUpdate);
    await project.save();

    if (project.client) {
      await redisClient.del(`my-post-job:${project.client._id}`);
      try {
        const freelancer = await UserModel.findById(req.user.id);
        await sendWorkUpdateSubmittedEmail(project.client, project, freelancer, description);
        await MessageModel.create({ sender: req.user.id, receiver: project.client._id, content: `📝 Work Update: "${project.title}"`, system: true });
      } catch (e) {}
    }

    return res.status(200).json({ success: true, update: newUpdate });
  } catch (error) { return res.status(500).json({ success: false, message: "Error" }); }
};

export const getDailyWorkUpdates = async (req, res) => {
  try {
    const project = await PostProjectModel.findById(req.params.projectId);
    if (!project) return res.status(404).json({ success: false });

    if (project.client && project.client.toString() === req.user.id) {
       let updated = false;
       project.dailyWorkUpdates.forEach(u => { if (!u.isSeen) { u.isSeen = true; updated = true; } });
       if (updated) {
         project.markModified('dailyWorkUpdates');
         await project.save();
         await redisClient.del(`my-post-job:${req.user.id}`);
       }
    }
    return res.status(200).json({ success: true, updates: project.dailyWorkUpdates });
  } catch (error) { return res.status(500).json({ success: false }); }
};
