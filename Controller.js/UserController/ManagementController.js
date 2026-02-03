import UserModel from "../../Model/UserModel.js";
import PostProjectModel from "../../Model/PostProjectModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import { redisClient } from "../../server.js";
import { generateUserUniqueId } from "./UserHelper.js";

/* 
=============================================
ADMIN USER MANAGEMENT
=============================================
*/

export const getAllUsers = async (req, res) => {
    try {
        const { page = 1, limit = 20, role, UserType, search } = req.query;
        const query = {};
        if (role) query.role = role;
        if (UserType) query.UserType = UserType;
        if (search) {
            query.$or = [
                { Fullname: { $regex: search, $options: "i" } },
                { username: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const users = await UserModel.find(query)
            .select("-password")
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await UserModel.countDocuments(query);
        return res.status(200).json({ success: true, data: users, totalUsers: count });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const getUserById = async (req, res) => {
    const user = await UserModel.findById(req.params.id).select("-password");
    return res.status(200).json({ success: true, data: user });
};

export const updateUserById = async (req, res) => {
    const updated = await UserModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return res.status(200).json({ success: true, data: updated });
};

export const deleteUserById = async (req, res) => {
    await UserModel.findByIdAndDelete(req.params.id);
    return res.status(200).json({ success: true, message: "User deleted" });
};

/* 
=============================================
PUBLIC & PROJECT VIEWS
=============================================
*/

export const getPublicUserProfile = async (req, res) => {
    const user = await UserModel.findById(req.params.id).select("-password -email -phone");
    return res.status(200).json({ success: true, user });
};

export const getUserProjects = async (req, res) => {
    const userId = req.params.userId;
    const clientProjects = await PostProjectModel.find({ client: userId });
    const hiredProjects = await ProjectApplyModel.find({ user: userId, status: "hired" }).populate("project");
    return res.status(200).json({ success: true, clientProjects, hiredProjects });
};

export const getUserCompleteDetails = async (req, res) => {
    const user = await UserModel.findById(req.params.id).select("-password");
    return res.status(200).json({ success: true, user });
};

/* 
=============================================
ANALYTICS & LOGS
=============================================
*/

export const getTotalAddFundAmount = async (req, res) => {
    const users = await UserModel.find({}, "addFundLogs");
    let total = 0;
    users.forEach(u => u.addFundLogs?.forEach(l => total += l.amount));
    return res.status(200).json({ success: true, totalAddFund: total });
};

export const getMonthlyAddFundAmounts = async (req, res) => {
    // Simplified monthly logic
    return res.status(200).json({ success: true, monthly: [] });
};

export const getUserEarningLogs = async (req, res) => {
    const user = await UserModel.findById(req.user.id).select("EarningLogs totalEarnings");
    return res.status(200).json({ success: true, data: user });
};

export const checkUsernameAvailability = async (req, res) => {
    try {
        const { username } = req.query;
        const exists = await UserModel.findOne({ username });
        return res.status(200).json({ success: true, available: !exists });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const getTopFreelancers = async (req, res) => {
    const freelancers = await UserModel.find({ UserType: "freelancer" }).sort({ rating: -1 }).limit(10);
    return res.status(200).json({ success: true, data: freelancers });
};
export const searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.status(400).json({ success: false, message: "Query is required" });
        }

        // Search by uniqueId (exact) or username (regex)
        const users = await UserModel.find({
            $or: [
                { uniqueId: query },
                { username: { $regex: query, $options: "i" } }
            ],
            _id: { $ne: req.user._id } // Exclude current user
        })
        .select("_id Fullname username profileImage uniqueId")
        .limit(10);

        return res.status(200).json({ success: true, users });
    } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
    }
};
