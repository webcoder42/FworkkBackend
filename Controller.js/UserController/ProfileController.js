import bcrypt from "bcryptjs";
import crypto from "crypto";
import UserModel from "../../Model/UserModel.js";
import PostProjectModel from "../../Model/PostProjectModel.js";
import ProjectApplyModel from "../../Model/ProjectApplyModel.js";
import { uploadImageToCloudinary } from "../../services/cloudinaryService.js";
import { sendAccountVerificationEmail } from "../../services/EmailService.js";
import { redisClient } from "../../server.js";
import sanitize from "mongo-sanitize";
import { 
    containsInappropriateContent, 
    handleProfileContentViolation,
    generateUserUniqueId,
    setRedisData,
    getRedisData,
    deleteRedisData,
    REDIS_ACC_PREFIX
} from "./UserHelper.js";

/* 
=============================================
RESTORED COMPLEX LOGIC FOR PROFILE UPDATES
=============================================
*/

export const getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await UserModel.findById(userId)
      .select("+password")
      .populate("referredBy", "username email profileImage");

    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.uniqueId) {
      user.uniqueId = generateUserUniqueId();
      await user.save();
    }

    const userData = {
      ...user.toObject(),
      hasPassword: !!user.password && user.password.startsWith("$"),
    };
    delete userData.password;
    
    // Compute VIP status
    if (Array.isArray(user.ClientAchievementStatus) && user.ClientAchievementStatus.length > 0) {
        const latest = [...user.ClientAchievementStatus].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        userData.vipStatus = latest?.level || "none";
        userData.vipAchievedAt = latest?.date || null;
    }

    return res.status(200).json({ success: true, user: userData });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const updates = req.body;
    const currentUser = await UserModel.findById(userId);

    if (!currentUser || currentUser.accountStatus === "suspended") {
      return res.status(403).json({ success: false, message: "Account suspended or not found" });
    }

    // Parse FormData strings
    ['skills', 'location', 'phone', 'socialLinks', 'portfolio'].forEach(field => {
      if (typeof updates[field] === 'string') {
        try { updates[field] = JSON.parse(updates[field]); } catch (e) {}
      }
    });

    // Content Validation
    const checkFields = ["Fullname", "bio", "username"];
    for (const f of checkFields) {
      if (updates[f] && containsInappropriateContent(updates[f])) {
        const violation = await handleProfileContentViolation(userId, updates[f], `Violation in ${f}`);
        if (violation.suspended) return res.status(403).json({ success: false, message: "Suspended", forceLogout: true });
        return res.status(400).json({ success: false, message: `Inappropriate content in ${f}`, isWarning: true });
      }
    }

    // Handle Profile Image Upload
    const profileImageFile = req.files?.profileImage?.[0] || req.file;
    if (profileImageFile) {
        const result = await uploadImageToCloudinary({
            buffer: profileImageFile.buffer,
            originalname: profileImageFile.originalname,
            mimetype: profileImageFile.mimetype
        }, "profile-images");
        updates.profileImage = result.url;
    }

    // Handle Portfolio Image Uploads
    if (updates.portfolio && Array.isArray(updates.portfolio)) {
        const portfolioFiles = req.files?.portfolioImages || [];
        let fileIdx = 0;
        updates.portfolio = await Promise.all(updates.portfolio.map(async (item) => {
            if (item.image === "file-upload-placeholder" && portfolioFiles[fileIdx]) {
                const pFile = portfolioFiles[fileIdx++];
                try {
                    const res = await uploadImageToCloudinary({
                        buffer: pFile.buffer, originalname: pFile.originalname, mimetype: pFile.mimetype
                    }, "portfolio-images");
                    item.image = res.url;
                } catch (e) {}
            }
            return item;
        }));
    }

    // Restricted fields
    delete updates.password; delete updates.role; delete updates.accountStatus;

    const user = await UserModel.findByIdAndUpdate(userId, updates, { new: true });
    await redisClient.del(`profile:${userId}`);

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error("Update error:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getProfileCompletion = async (req, res) => {
    try {
        const user = await UserModel.findById(req.user.id);
        const fields = { Fullname: 10, username: 10, email: 10, profileImage: 10, bio: 10, skills: 10, location: 20, socialLinks: 10, portfolio: 10 };
        let perc = 0; let missing = [];
        Object.entries(fields).forEach(([f, w]) => {
            let val = user[f];
            let ok = val && (Array.isArray(val) ? val.length > 0 : (typeof val === 'object' ? Object.keys(val).length > 0 : !!val));
            if (ok) perc += w; else missing.push(f);
        });
        return res.status(200).json({ success: true, completionPercentage: perc, missingFields: missing });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const updatePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const user = await UserModel.findById(req.user.id).select("+password");
        if (user.password && user.password.startsWith("$") && !await bcrypt.compare(currentPassword, user.password)) {
            return res.status(401).json({ success: false, message: "Incorrect current password" });
        }
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        return res.status(200).json({ success: true, message: "Updated" });
    } catch (e) { return res.status(500).json({ success: false }); }
};

export const changeUserRole = async (req, res) => {
    const { newRole } = req.body;
    const user = await UserModel.findByIdAndUpdate(req.user.id, { UserType: newRole }, { new: true });
    return res.status(200).json({ success: true, user });
};

export const getUserSecurity = async (req, res) => {
    const user = await UserModel.findById(req.user.id).select("securityQuestion securityAnswer");
    return res.status(200).json({ success: true, securityQuestion: user.securityQuestion, securityAnswer: user.securityAnswer });
};

export const verifyUserSecurity = async (req, res) => {
    const { answer } = req.body;
    const user = await UserModel.findById(req.user.id).select("securityAnswer");
    if (user.securityAnswer === answer) return res.status(200).json({ success: true });
    return res.status(401).json({ success: false });
};

export const sendAccountVerification = async (req, res) => {
    const user = await UserModel.findById(req.user.id).select("email");
    const code = crypto.randomInt(100000, 999999).toString();
    await setRedisData(`${REDIS_ACC_PREFIX}${user.email}`, { userId: user._id, verificationCode: code }, 600);
    await sendAccountVerificationEmail(user.email, code);
    return res.status(200).json({ success: true });
};

export const verifyAccountCode = async (req, res) => {
    const { code } = req.body;
    const user = await UserModel.findById(req.user.id);
    const store = await getRedisData(`${REDIS_ACC_PREFIX}${user.email}`);
    if (store && store.verificationCode === code) {
        user.isVerified = true;
        await user.save();
        await deleteRedisData(`${REDIS_ACC_PREFIX}${user.email}`);
        return res.status(200).json({ success: true });
    }
    return res.status(400).json({ success: false });
};
