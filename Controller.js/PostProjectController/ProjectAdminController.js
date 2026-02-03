import PostProjectModel from "../../Model/PostProjectModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import SubmitProjectModel from "../../Model/SubmitProjectModel.js";
import { sendDeletionEmailToClient, sendDeletionEmailToApplicant } from "../../services/EmailService.js";
import { redisClient } from "../../server.js";

export const getAllProjectsWithApplicantsAdmin = async (req, res) => {
  try {
    const cacheKey = 'get-all-job';
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const projects = await PostProjectModel.find().populate("client", "username email").sort({ createdAt: -1 }).lean();
    const result = await Promise.all(projects.map(async p => {
      const applicants = await ProjectApplyModel.find({ project: p._id }).populate("user", "username email").lean();
      const submission = await SubmitProjectModel.findOne({ project: p._id }).populate("user", "username email").lean();
      return { ...p, applicants, submission };
    }));

    const response = { success: true, data: result };
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    return res.status(200).json(response);
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const deleteProjectAndApplicantsAdmin = async (req, res) => {
  try {
    const project = await PostProjectModel.findById(req.params.id).populate("client");
    if (!project) return res.status(404).json({ success: false });

    const applicants = await ProjectApplyModel.find({ project: project._id }).populate("user");
    await sendDeletionEmailToClient(project.client, project);
    for (const app of applicants) {
      await sendDeletionEmailToApplicant(app.user, project);
    }

    await ProjectApplyModel.deleteMany({ project: project._id });
    await PostProjectModel.findByIdAndDelete(project._id);
    await redisClient.del(`get-all-job`);
    
    return res.status(200).json({ success: true, message: "Deleted and notified" });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};
