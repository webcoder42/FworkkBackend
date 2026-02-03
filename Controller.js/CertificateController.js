import Certificate from "../Model/CertificateModel.js";
import User from "../Model/UserModel.js";
import crypto from "crypto";
import PostProject from "../Model/PostProjectModel.js";
import ProjectApply from "../Model/ProjectApplyModel.js";

const API_FRONTENT_URL = process.env.API_FRONTENT_URL || "https://fworkk.netlify.app";

// Helper function to get user performance analytics
const getUserStatsInternal = async (userId) => {
    try {
        const user = await User.findById(userId);
        if (!user) return null;

        // Find all projects where this user was hired and the project is completed
        const hiredApps = await ProjectApply.find({ user: userId, status: "hired" }).populate("project");
        
        const skillCounts = {};
        let totalHiredProjects = hiredApps.length;

        hiredApps.forEach(app => {
            if (app.project && app.project.skillsRequired) {
                app.project.skillsRequired.forEach(skill => {
                    skillCounts[skill] = (skillCounts[skill] || 0) + 1;
                });
            }
        });

        // Find the top skill
        const sortedSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
        const topSkill = sortedSkills.length > 0 ? sortedSkills[0][0] : (user.skills && user.skills.length > 0 ? user.skills[0].name : "Professional Freelancing");

        return {
            fullname: user.Fullname,
            username: user.username,
            rating: user.rating || 0,
            completedProjects: user.completedProjects || 0,
            totalEarnings: user.totalEarnings || 0,
            topSkill: topSkill,
            skills: user.skills ? user.skills.map(s => s.name) : [],
            userType: user.UserType,
            profileImage: user.profileImage,
            createdAt: user.createdAt
        };
    } catch (e) {
        console.error("Error in stats analysis:", e);
        return null;
    }
};

// Create a new certificate record
export const createCertificate = async (req, res) => {
  try {
    const { title, description, tier } = req.body;
    const userId = req.user.id || req.user._id; 

    const stats = await getUserStatsInternal(userId);
    if (!stats) {
      return res.status(404).json({ success: false, message: "User stats not found" });
    }

    // Generate a unique Certificate ID
    const certificateId = `FW-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    // Create the verification URL
    const baseUrl = req.body.baseUrl || API_FRONTENT_URL;
    const verificationUrl = `${baseUrl}/verify-certificate/${certificateId}`;

    const newCertificate = new Certificate({
      userId,
      certificateId,
      title,
      description,
      tier: tier || "Bronze",
      snapshot: stats,
      verificationUrl
    });

    await newCertificate.save();

    res.status(201).json({
      success: true,
      certificate: newCertificate,
      message: "Certificate generated successfully"
    });

  } catch (error) {
    console.error("Error creating certificate:", error);
    res.status(500).json({ success: false, message: "Failed to generate certificate record" });
  }
};

// Get performance stats for certificate preview
export const getUserStats = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const stats = await getUserStatsInternal(userId);
        res.json({ success: true, stats });
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal Server Error" });
    }
}


// Get certificate by ID (Public)
export const getCertificate = async (req, res) => {
  try {
    const { certificateId } = req.params;
    const certificate = await Certificate.findOne({ certificateId }).populate("userId", "Fullname username profileImage"); 

    if (!certificate) {
      return res.status(404).json({ success: false, message: "Certificate not found" });
    }

    res.status(200).json({
      success: true,
      certificate
    });
  } catch (error) {
    console.error("Error fetching certificate:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

// Get All Certificates (Admin Only)
export const getAllCertificates = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = "" } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { certificateId: { $regex: search, $options: "i" } },
        { "snapshot.fullname": { $regex: search, $options: "i" } },
        { "snapshot.username": { $regex: search, $options: "i" } }
      ];
    }

    const certificates = await Certificate.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const total = await Certificate.countDocuments(query);

    res.status(200).json({
      success: true,
      certificates,
      total,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error("Error fetching all certificates:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
