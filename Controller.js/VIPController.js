import User from "../Model/UserModel.js";
import PostProject from "../Model/PostProjectModel.js";
import { sendVIPEmail } from "../services/EmailService.js";
import { sendFreelancerAchievementEmail } from "../services/EmailService.js";
// Function: Check & Update VIP Status
export const checkAndUpdateVIPStatus = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const projectCount = await PostProject.countDocuments({ client: userId });

    let newVIPStatus = "none";
    let shouldSendEmail = false;

    if (projectCount >= 23) {
      newVIPStatus = "Legend";
    } else if (projectCount >= 20) {
      newVIPStatus = "Master";
    } else if (projectCount >= 10) {
      newVIPStatus = "VIP";
    }

    if (newVIPStatus !== "none" && newVIPStatus !== user.vipStatus) {
      shouldSendEmail = true;

      await User.findByIdAndUpdate(
        userId,
        {
          vipStatus: newVIPStatus,
          vipAchievedAt: new Date(),
          $push: {
            ClientAchievementStatus: {
              level: newVIPStatus, // 👈 ab "level" use ho raha hai "type" ki jagah
              date: new Date(),
            },
          },
        },
        { new: true }
      );

      if (shouldSendEmail) {
        await sendVIPEmail(
          user.email,
          user.Fullname,
          newVIPStatus,
          projectCount
        );
      }
    }

    return {
      success: true,
      vipStatus: newVIPStatus,
      projectCount,
      emailSent: shouldSendEmail,
    };
  } catch (error) {
    console.error("Error in checkAndUpdateVIPStatus:", error);
    throw error;
  }
};
/**
 * Suggest top 3 freelancers for a posted project by a Master client
 * @param {Object} project - The posted project object (must include title, skillsRequired)
 * @returns {Array} - Array of top 3 freelancer objects
 */
// Suggest top 3 freelancers for Master clients (any status)
export const suggestTopFreelancers = async (project) => {
  const { title, skillsRequired } = project;
  if (
    !skillsRequired ||
    !Array.isArray(skillsRequired) ||
    skillsRequired.length === 0
  )
    return [];

  // Find all freelancers (users with role 'user' and skills)
  const freelancers = await User.find({
    role: "user",
    skills: { $exists: true, $not: { $size: 0 } },
  });

  // Helper to calculate skill match percentage
  function getSkillMatch(userSkills, requiredSkills) {
    if (!userSkills || userSkills.length === 0) return 0;
    const matched = requiredSkills.filter((skill) =>
      userSkills.includes(skill)
    );
    return Math.round((matched.length / requiredSkills.length) * 100);
  }

  // Helper to check title relevance (simple keyword match)
  function getTitleMatch(userSkills, title) {
    if (!title) return 0;
    const titleWords = title.toLowerCase().split(/\s+/);
    const matched = userSkills.filter((skill) =>
      titleWords.includes(skill.toLowerCase())
    );
    return matched.length > 0 ? 20 : 0; // bonus points for title match
  }

  // For each freelancer, calculate match score
  const scoredFreelancers = await Promise.all(
    freelancers.map(async (user) => {
      const skillMatch = getSkillMatch(user.skills, skillsRequired);
      const titleMatch = getTitleMatch(user.skills, title);

      // Find completed projects by this freelancer that match required skills
      const completedProjects = await PostProject.find({
        client: user._id,
        status: "completed",
        skillsRequired: { $in: skillsRequired },
      });
      const completedCount = completedProjects.length;

      // Calculate overall score
      const score =
        skillMatch + titleMatch + completedCount * 5 + (user.rating || 0);

      return {
        _id: user._id,
        name: user.Fullname,
        skills: user.skills,
        rating: user.rating || 0,
        completedProjects: user.completedProjects || 0,
        matchedCompleted: completedCount,
        score,
      };
    })
  );

  // Filter for at least 70% skill match
  const filtered = scoredFreelancers.filter(
    (f) => getSkillMatch(f.skills, skillsRequired) >= 70
  );

  // Sort by score, completedProjects, rating
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.completedProjects !== a.completedProjects)
      return b.completedProjects - a.completedProjects;
    return b.rating - a.rating;
  });

  // Return top 3
  return filtered.slice(0, 3);
};

// Suggest top 3 freelancers for Legend clients (only online)
export const suggestTopOnlineFreelancers = async (project) => {
  const { title, skillsRequired } = project;
  if (
    !skillsRequired ||
    !Array.isArray(skillsRequired) ||
    skillsRequired.length === 0
  )
    return [];

  // Find all online freelancers (users with role 'user', skills, and availability 'online')
  const freelancers = await User.find({
    role: "user",
    skills: { $exists: true, $not: { $size: 0 } },
    availability: "online",
  });

  // Helper to calculate skill match percentage
  function getSkillMatch(userSkills, requiredSkills) {
    if (!userSkills || userSkills.length === 0) return 0;
    const matched = requiredSkills.filter((skill) =>
      userSkills.includes(skill)
    );
    return Math.round((matched.length / requiredSkills.length) * 100);
  }

  // Helper to check title relevance (simple keyword match)
  function getTitleMatch(userSkills, title) {
    if (!title) return 0;
    const titleWords = title.toLowerCase().split(/\s+/);
    const matched = userSkills.filter((skill) =>
      titleWords.includes(skill.toLowerCase())
    );
    return matched.length > 0 ? 20 : 0; // bonus points for title match
  }

  // For each freelancer, calculate match score
  const scoredFreelancers = await Promise.all(
    freelancers.map(async (user) => {
      const skillMatch = getSkillMatch(user.skills, skillsRequired);
      const titleMatch = getTitleMatch(user.skills, title);

      // Find completed projects by this freelancer that match required skills
      const completedProjects = await PostProject.find({
        client: user._id,
        status: "completed",
        skillsRequired: { $in: skillsRequired },
      });
      const completedCount = completedProjects.length;

      // Calculate overall score
      const score =
        skillMatch + titleMatch + completedCount * 5 + (user.rating || 0);

      return {
        _id: user._id,
        name: user.Fullname,
        skills: user.skills,
        rating: user.rating || 0,
        completedProjects: user.completedProjects || 0,
        matchedCompleted: completedCount,
        score,
      };
    })
  );

  // Filter for at least 70% skill match
  const filtered = scoredFreelancers.filter(
    (f) => getSkillMatch(f.skills, skillsRequired) >= 70
  );

  // Sort by score, completedProjects, rating
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.completedProjects !== a.completedProjects)
      return b.completedProjects - a.completedProjects;
    return b.rating - a.rating;
  });

  // Return top 3 online freelancers
  return filtered.slice(0, 3);
};

// Function: Get User VIP Status
export const getUserVIPStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select(
      "vipStatus vipAchievedAt Fullname ClientAchievementStatus"
    );
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const projectCount = await PostProject.countDocuments({ client: userId });

    res.status(200).json({
      success: true,
      data: {
        vipStatus: user.vipStatus,
        vipAchievedAt: user.vipAchievedAt,
        projectCount,
        userName: user.Fullname,
        achievements: user.ClientAchievementStatus,
      },
    });
  } catch (error) {
    console.error("Error in getUserVIPStatus:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Function: Get All VIP Users
export const getAllVIPUsers = async (req, res) => {
  try {
    const vipUsers = await User.find({
      vipStatus: { $in: ["VIP", "Master", "Legend"] },
    }).select("Fullname vipStatus vipAchievedAt profileImage username");

    res.status(200).json({
      success: true,
      data: vipUsers,
    });
  } catch (error) {
    console.error("Error in getAllVIPUsers:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Function: Get VIP Stats
export const getVIPStats = async (req, res) => {
  try {
    const vipCount = await User.countDocuments({ vipStatus: "VIP" });
    const masterCount = await User.countDocuments({ vipStatus: "Master" });
    const legendCount = await User.countDocuments({ vipStatus: "Legend" });

    res.status(200).json({
      success: true,
      data: {
        vip: vipCount,
        master: masterCount,
        legend: legendCount,
        total: vipCount + masterCount + legendCount,
      },
    });
  } catch (error) {
    console.error("Error in getVIPStats:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Function: Manually Check & Update VIP Status
export const checkVIPStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await checkAndUpdateVIPStatus(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error in checkVIPStatus:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
