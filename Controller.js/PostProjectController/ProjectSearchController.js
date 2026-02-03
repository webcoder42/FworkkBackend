import PostProjectModel from "../../Model/PostProjectModel.js";
import UserModel from "../../Model/UserModel.js";
import { redisClient } from "../../server.js";

const normalizeVipStatus = (client) => {
    if (!client) return { vipStatus: "none", vipAchievedAt: null };
    let vipStatus = client.vipStatus || "none";
    let vipAchievedAt = client.vipAchievedAt || null;
    const cas = client.ClientAchievementStatus;
    if (Array.isArray(cas) && cas.length > 0) {
        const latest = [...cas].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        vipStatus = latest?.level || vipStatus || "none";
        vipAchievedAt = latest?.date || vipAchievedAt || null;
    }
    return { vipStatus, vipAchievedAt };
};

export const getAllJobPosts = async (req, res) => {
  try {
    const cacheKey = "get-all-jobs";
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const totalJobs = await PostProjectModel.countDocuments({ status: { $ne: "hold" } });
    let jobs = await PostProjectModel.find({ status: { $ne: "hold" } })
      .populate("client", "username email totalSpend vipStatus vipAchievedAt ClientAchievementStatus")
      .sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();

    jobs = jobs.map(j => {
        const vip = normalizeVipStatus(j.client);
        if (j.client) { j.client.vipStatus = vip.vipStatus; j.client.vipAchievedAt = vip.vipAchievedAt; }
        return j;
    });

    const response = { success: true, totalJobs, page, limit, data: jobs };
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    return res.status(200).json(response);
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getLatestJobPosts = async (req, res) => {
  try {
    const cacheKey = 'latest-job';
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const limit = parseInt(req.query.limit) || 5;
    const latestJobs = await PostProjectModel.find({ status: { $ne: "hold" } })
      .sort({ createdAt: -1 }).limit(limit).populate("client", "username email profileImage").lean();

    const response = { success: true, total: latestJobs.length, data: latestJobs };
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    return res.status(200).json(response);
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const searchJobPosts = async (req, res) => {
  try {
    const { query, category, minBudget, maxBudget } = req.query;
    let searchQuery = { status: { $ne: "hold" } };

    if (query) {
      searchQuery.$or = [
        { title: { $regex: query, $options: "i" } },
        { description: { $regex: query, $options: "i" } },
        { skillsRequired: { $in: [new RegExp(query, "i")] } },
      ];
    }
    if (category) searchQuery.category = category;
    if (minBudget || maxBudget) {
      searchQuery.budget = {};
      if (minBudget) searchQuery.budget.$gte = Number(minBudget);
      if (maxBudget) searchQuery.budget.$lte = Number(maxBudget);
    }

    let jobs = await PostProjectModel.find(searchQuery)
      .populate("client", "username email vipStatus vipAchievedAt ClientAchievementStatus")
      .sort({ createdAt: -1 }).lean();

    jobs = jobs.map(j => {
        const vip = normalizeVipStatus(j.client);
        if (j.client) { j.client.vipStatus = vip.vipStatus; j.client.vipAchievedAt = vip.vipAchievedAt; }
        return j;
    });

    return res.status(200).json({ success: true, data: jobs });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getJobPostById = async (req, res) => {
  try {
    const cacheKey = `get-single-job:${req.params.id}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) return res.status(200).json(JSON.parse(cached));

    const job = await PostProjectModel.findById(req.params.id).populate("client", "username email");
    if (!job) return res.status(404).json({ success: false, message: "Not found" });

    const response = { success: true, data: job };
    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));
    return res.status(200).json(response);
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};

export const getProjectDetailsWithVerification = async (req, res) => {
  try {
    const project = await PostProjectModel.findById(req.params.id).populate("client").lean();
    if (!project) return res.status(404).json({ success: false, message: "Not found" });

    const client = await UserModel.findById(project.client._id).lean();
    const vip = normalizeVipStatus(client);

    const data = {
      project: { ...project, client: undefined },
      clientInfo: {
        id: client._id, username: client.username, email: client.email, profileImage: client.profileImage,
        vipStatus: vip.vipStatus, vipAchievedAt: vip.vipAchievedAt,
        isVerified: client.isVerified, joinDate: client.createdAt,
        totalProjectsCreated: await PostProjectModel.countDocuments({ client: client._id }),
        totalSpend: client.totalSpend, totalEarnings: client.totalEarnings,
      },
    };

    return res.status(200).json({ success: true, data });
  } catch (error) { return res.status(500).json({ success: false, message: error.message }); }
};
