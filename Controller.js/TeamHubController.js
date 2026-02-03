import TeamHub from "../Model/TeamHubModel.js";
import PlanPurchaseModel from "../Model/PlanPurchaseModel.js";
import PlanSchemaModel from "../Model/PlanSchemaModel.js";
import UserModel from "../Model/UserModel.js";
import SiteSettings from "../Model/SiteSettingsModel.js";
import Transaction from "../Model/TransactionModel.js";
import {
  sendTaskAssignmentEmail,
  sendTaskStatusUpdateEmail,
  sendEarningUpdateEmail
} from "../services/EmailService.js";

// Helper function to check if team plan is expired
const checkTeamPlanStatus = async (userId) => {
  try {
    const activePlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved",
    }).populate("plan");

    if (!activePlan) {
      return { isExpired: true, plan: null, message: "No active plan found" };
    }

    const now = new Date();
    const endDate = new Date(activePlan.endDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const planEndDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    const isExpired = planEndDate < today;
    const isTeamPlan = activePlan.plan.planPurpose === "team";

    return {
      isExpired: isExpired || !isTeamPlan,
      plan: activePlan,
      message: isExpired
        ? "Plan has expired"
        : !isTeamPlan
        ? "Not a team plan"
        : null,
    };
  } catch (error) {
    console.error("Error checking team plan status:", error);
    return {
      isExpired: true,
      plan: null,
      message: "Error checking plan status",
    };
  }
};
import { uploadImageToCloudinary } from "../services/cloudinaryService.js";

export const createTeam = async (req, res) => {
  try {
    const { name, description } = req.body;
    let logo = req.body.logo;
    const userId = req.user.id;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "Name and description are required",
      });
    }

    // Process logo if provided via stream (multer) or base64
    if (req.file) {
      try {
        const cloudinaryResult = await uploadImageToCloudinary({
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        }, 'workspace-logos');
        logo = cloudinaryResult.url;
      } catch (error) {
        console.error("Error uploading logo to Cloudinary:", error);
      }
    } else if (logo && logo.startsWith("data:image/")) {
       try {
        const cloudinaryResult = await uploadImageToCloudinary({
          base64: logo,
          name: `logo-${userId}-${Date.now()}`,
          size: logo.length,
          type: logo.split(";")[0].split(":")[1],
        }, 'workspace-logos');
        logo = cloudinaryResult.url;
      } catch (error) {
        console.error("Error uploading base64 logo to Cloudinary:", error);
      }
    }

    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const activePlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved",
    }).populate("plan");

    if (!activePlan) {
      return res.status(400).json({
        success: false,
        message:
          "You need an active plan to create a team. Please purchase a team plan first.",
      });
    }

    const now = new Date();
    const endDate = new Date(activePlan.endDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const planEndDate = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      endDate.getDate()
    );

    if (planEndDate < today) {
      return res.status(400).json({
        success: false,
        message:
          "Your plan has expired. Please renew your team plan to create a team.",
      });
    }

    if (activePlan.plan.planPurpose !== "team") {
      return res.status(400).json({
        success: false,
        message:
          "You need a team plan to create a team. Please purchase a team plan first.",
      });
    }

    const newTeam = new TeamHub({
      name,
      description,
      logo: logo || "",
      createdBy: userId,
      members: [
        {
          user: userId,
          role: "admin",
          joinedAt: new Date(),
          status: "active",
        },
      ],
      planId: activePlan._id,
    });

    const savedTeam = await newTeam.save();

    res.status(201).json({
      success: true,
      message: "Team created successfully",
      team: savedTeam,
    });
  } catch (error) {
    console.error("Error creating team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while creating team",
      error: error.message,
    });
  }
};

export const updateTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, description } = req.body;
    let logo = req.body.logo;
    const userId = req.user.id;

    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: "Name and description are required",
      });
    }

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy.toString() === userId ||
      team.createdBy === userId.toString() ||
      team.createdBy === userId;

    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: "You can only edit teams you created",
      });
    }

    // Process new logo if provided
    if (req.file) {
      try {
        const cloudinaryResult = await uploadImageToCloudinary({
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype
        }, 'workspace-logos');
        logo = cloudinaryResult.url;
      } catch (error) {
        console.error("Error uploading new logo to Cloudinary:", error);
      }
    } else if (logo && logo.startsWith("data:image/")) {
       try {
        const cloudinaryResult = await uploadImageToCloudinary({
          base64: logo,
          name: `logo-${userId}-${Date.now()}`,
          size: logo.length,
          type: logo.split(";")[0].split(":")[1],
        }, 'workspace-logos');
        logo = cloudinaryResult.url;
      } catch (error) {
        console.error("Error uploading base64 logo to Cloudinary:", error);
      }
    }

    const updatedTeam = await TeamHub.findByIdAndUpdate(
      teamId,
      {
        name,
        description,
        logo: logo || team.logo,
      },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Team updated successfully",
      team: updatedTeam,
    });
  } catch (error) {
    console.error("Error updating team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating team",
      error: error.message,
    });
  }
};

export const deleteTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // More robust comparison that handles both ObjectId and string types
    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy.toString() === userId ||
      team.createdBy === userId.toString() ||
      team.createdBy === userId;

    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: "You can only delete teams you created",
      });
    }

    await TeamHub.findByIdAndDelete(teamId);

    res.status(200).json({
      success: true,
      message: "Team deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while deleting team",
      error: error.message,
    });
  }
};




export const sendChatMessage = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { message } = req.body;
    const userId = req.user.id;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isMember = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() || member.user === userId
    );
    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    // SendChatMessage - User permissions checked

    if (!isMember && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this team",
      });
    }

    // Check team plan status for creator (use creator's ObjectId when populated)
    const creatorIdForPlan =
      team.createdBy && team.createdBy._id
        ? team.createdBy._id.toString()
        : team.createdBy.toString();
    const planStatus = await checkTeamPlanStatus(creatorIdForPlan);
    if (planStatus.isExpired) {
      return res.status(403).json({
        success: false,
        message: isCreator
          ? "Your team plan has expired. Please activate your plan first."
          : "Team plan has expired. Please wait for admin to activate the plan.",
      });
    }

    // Check if user has permission to send messages
    if (!isCreator && !isAdmin && team.settings?.allowMessages === false) {
      return res.status(403).json({
        success: false,
        message: "Message sending is disabled by admin",
      });
    }

    // Create new message
    const newMessage = {
      sender: userId,
      message: message.trim(),
      timestamp: new Date(),
      isAdmin: isCreator || isAdmin,
    };

    // Add message to team chat
    team.chat.push(newMessage);
    await team.save();

    // Populate sender info for response
    const populatedTeam = await TeamHub.findById(teamId)
      .populate("chat.sender", "username email profilePicture")
      .populate("members.user", "username email profilePicture")
      .populate("createdBy", "username email profilePicture");

    // Emit socket event to team room
    if (req.io) {
        // Send the complete updated team object or just the new message
        // Ideally we send the new message, but the frontend expects to update the whole team or chat list
        // Let's send the updated chat list or the specific new message. 
        // Sending the updated team object ensures sync.
        req.io.to(`team_${teamId}`).emit("newTeamMessage", {
            team: populatedTeam,
            message: populatedTeam.chat[populatedTeam.chat.length - 1]
        });
    }

    res.status(200).json({
      success: true,
      message: "Message sent successfully",
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error sending chat message:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while sending message",
      error: error.message,
    });
  }
};

export const addUserToTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { uniqueId } = req.body;
    const userId = req.user.id;

    if (!uniqueId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only team creator and admins can add users",
      });
    }

    // Check team plan status for creator
    const planStatus = await checkTeamPlanStatus(team.createdBy.toString());
    if (planStatus.isExpired) {
      return res.status(403).json({
        success: false,
        message: isCreator
          ? "Your team plan has expired. Please activate your plan first."
          : "Team plan has expired. Please wait for admin to activate the plan.",
      });
    }

    const userToAdd = await UserModel.findOne({ uniqueId });
    if (!userToAdd) {
      return res.status(404).json({
        success: false,
        message: "User not found with this ID",
      });
    }

    const isAlreadyMember = team.members.some(
      (member) =>
        member.user.toString() === userToAdd._id.toString() ||
        member.user === userToAdd._id
    );
    if (isAlreadyMember) {
      return res.status(400).json({
        success: false,
        message: "User is already a member of this team",
      });
    }

    team.members.push({
      user: userToAdd._id,
      role: "member",
      joinedAt: new Date(),
      status: "active",
    });

    await team.save();

    const populatedTeam = await TeamHub.findById(teamId)
      .populate("createdBy", "name email")
      .populate("members.user", "name email");

    res.status(200).json({
      success: true,
      message: "User added to team successfully",
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error adding user to team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while adding user",
      error: error.message,
    });
  }
};

export const removeUserFromTeam = async (req, res) => {
  try {
    const { teamId, userId: userToRemoveId } = req.params;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only team creator and admins can remove users",
      });
    }

    team.members = team.members.filter(
      (member) =>
        member.user.toString() !== userToRemoveId.toString() &&
        member.user !== userToRemoveId
    );

    await team.save();

    const populatedTeam = await TeamHub.findById(teamId)
      .populate("createdBy", "name email")
      .populate("members.user", "name email");

    res.status(200).json({
      success: true,
      message: "User removed from team successfully",
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error removing user from team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while removing user",
      error: error.message,
    });
  }
};

export const promoteUserToAdmin = async (req, res) => {
  try {
    const { teamId, userId: userToPromoteId } = req.params;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only team creator can promote users to admin",
      });
    }

    const memberToPromote = team.members.find(
      (member) =>
        member.user.toString() === userToPromoteId.toString() ||
        member.user === userToPromoteId
    );

    if (!memberToPromote) {
      return res.status(404).json({
        success: false,
        message: "User is not a member of this team",
      });
    }

    if (memberToPromote.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "User is already an admin",
      });
    }

    memberToPromote.role = "admin";
    await team.save();

    const populatedTeam = await TeamHub.findById(teamId)
      .populate("createdBy", "name email")
      .populate("members.user", "name email");

    res.status(200).json({
      success: true,
      message: "User promoted to admin successfully",
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error promoting user to admin:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while promoting user",
      error: error.message,
    });
  }
};

export const demoteUserFromAdmin = async (req, res) => {
  try {
    const { teamId, userId: userToDemoteId } = req.params;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    if (!isCreator) {
      return res.status(403).json({
        success: false,
        message: "Only team creator can demote admins",
      });
    }

    const memberToDemote = team.members.find(
      (member) =>
        member.user.toString() === userToDemoteId.toString() ||
        member.user === userToDemoteId
    );

    if (!memberToDemote) {
      return res.status(404).json({
        success: false,
        message: "User is not a member of this team",
      });
    }

    if (memberToDemote.role !== "admin") {
      return res.status(400).json({
        success: false,
        message: "User is not an admin",
      });
    }

    memberToDemote.role = "member";
    await team.save();

    const populatedTeam = await TeamHub.findById(teamId)
      .populate("createdBy", "name email")
      .populate("members.user", "name email");

    res.status(200).json({
      success: true,
      message: "User demoted from admin successfully",
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error demoting user from admin:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while demoting user",
      error: error.message,
    });
  }
};

// TeamHubController.js

export const getUserTeams = async (req, res) => {
  try {
    const userId = req.user.id;

    console.log(`Fetching teams for user: ${userId}`); // cache debug

    const teams = await TeamHub.find({
      $or: [{ createdBy: userId }, { "members.user": userId }],
    })
      .populate("createdBy", "name email")
      .populate("members.user", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      message: "Teams fetched successfully",
      teams,
    });
  } catch (error) {
    console.error("Error fetching user teams:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching teams",
      error: error.message,
    });
  }
};

export const getTeamById = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    console.log(`Fetching team: ${teamId} for user: ${userId}`); // cache debug

    const team = await TeamHub.findById(teamId)
      .populate("createdBy", "name email")
      .populate("members.user", "name email")
      .populate("chat.sender", "name email");

    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isMember = team.members.some(
      (member) => member.user._id.toString() === userId.toString()
    );

    const isCreator = team.createdBy._id.toString() === userId.toString();

    if (!isMember && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this team",
      });
    }

    // Check team plan status
    const planStatus = await checkTeamPlanStatus(team.createdBy._id.toString());

    const teamWithPlanStatus = {
      ...team.toObject(),
      planStatus: {
        isExpired: planStatus.isExpired,
        message: planStatus.message,
        plan: planStatus.plan,
      },
    };

    res.status(200).json({
      success: true,
      message: "Team fetched successfully",
      team: teamWithPlanStatus,
    });
  } catch (error) {
    console.error("Error fetching team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching team",
      error: error.message,
    });
  }
};

export const getTeamTasks = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    console.log(`Fetching tasks for team: ${teamId} by user: ${userId}`); // cache debug

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isMember = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() || member.user === userId
    );
    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;

    if (!isMember && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this team",
      });
    }

    // Populate assignedTo field for tasks
    const populatedTeam = await TeamHub.findById(teamId)
      .populate("tasks.assignedTo", "name email")
      .populate("members.user", "name email");

    res.status(200).json({
      success: true,
      message: "Tasks fetched successfully",
      tasks: populatedTeam.tasks || [],
    });
  } catch (error) {
    console.error("Error fetching team tasks:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while fetching tasks",
      error: error.message,
    });
  }
};

export const createTeamTask = async (req, res) => {
  try {
    const { teamId } = req.params;
    const {
      title,
      description,
      assignedToUserId,
      assignedToEmail,
      amount,
      priority,
      dueDate,
    } = req.body;
    const userId = req.user.id;

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        message: "Title and description are required",
      });
    }

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only team creator and admins can create tasks",
      });
    }

    // Check team plan status for creator
    const planStatus = await checkTeamPlanStatus(team.createdBy.toString());
    if (planStatus.isExpired) {
      return res.status(403).json({
        success: false,
        message: isCreator
          ? "Your team plan has expired. Please activate your plan first."
          : "Team plan has expired. Please wait for admin to activate the plan.",
      });
    }

    // Validate assigned user if provided
    let assignedTo = null;
    if (assignedToUserId) {
      const isAssignedUserMember = team.members.some(
        (member) =>
          member.user.toString() === assignedToUserId.toString() ||
          member.user === assignedToUserId
      );
      if (!isAssignedUserMember) {
        return res.status(400).json({
          success: false,
          message: "Assigned user must be a team member",
        });
      }
      assignedTo = assignedToUserId;
    }

    // Check if user has enough balance for task amount
    if (amount && amount > 0) {
      const user = await UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      if (user.totalEarnings < amount) {
        return res.status(400).json({
          success: false,
          message: "You don't have enough balance to create this task",
        });
      }

      // Deduct amount from user's totalEarnings
      user.totalEarnings -= amount;
      
      // Add earning log
      if (!user.EarningLogs) user.EarningLogs = [];
      user.EarningLogs.push({
        amount: -amount,
        date: new Date(),
        reason: `Task created: ${title}`
      });

      await user.save();

      // Send email notification for deduction
      await sendEarningUpdateEmail(
        user.email,
        user.username || user.Fullname,
        amount,
        'decrement',
        `Deduction for creating task: "${title.trim()}"`
      );
    }

    const newTask = {
      title: title.trim(),
      description: description.trim(),
      assignedTo: assignedTo,
      assignedToEmail: assignedToEmail || "",
      amount: amount || 0,
      priority: priority || "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: "pending",
      createdAt: new Date(),
      payerId: amount > 0 ? userId : null,
    };

    team.tasks.push(newTask);

    // Add system message to chat about task creation
    const systemMessage = {
      sender: userId,
      message: `📋 New task created: "${newTask.title}"${
        newTask.amount > 0 ? ` ($${newTask.amount})` : ""
      }${
        newTask.assignedToEmail
          ? ` - Assigned to: ${newTask.assignedToEmail}`
          : ""
      }`,
      timestamp: new Date(),
      isAdmin: true,
      isSystemMessage: true,
    };

    team.chat.push(systemMessage);
    await team.save();

    // Send email to assigned user
    if (assignedTo) {
      const assignedUser = await UserModel.findById(assignedTo);
      if (assignedUser) {
        await sendTaskAssignmentEmail(
          assignedUser.email,
          assignedUser.username || assignedUser.Fullname,
          newTask.title,
          team.name,
          newTask.amount,
          newTask.dueDate
        );
      }
    }

    // Populate team data for response
    const populatedTeam = await TeamHub.findById(teamId)
      .populate("chat.sender", "username email profilePicture")
      .populate("members.user", "username email profilePicture")
      .populate("createdBy", "username email profilePicture");

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      task: newTask,
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error creating team task:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while creating task",
      error: error.message,
    });
  }
};

export const updateTeamTask = async (req, res) => {
  try {
    const { teamId, taskId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    const isMember = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() || member.user === userId
    );
    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    if (!isMember && !isCreator) {
      return res.status(403).json({
        success: false,
        message: "You don't have access to this team",
      });
    }

    // Check team plan status for creator (only if creator or admin is updating)
    if (isCreator || isAdmin) {
      const planStatus = await checkTeamPlanStatus(team.createdBy.toString());
      if (planStatus.isExpired) {
        return res.status(403).json({
          success: false,
          message: isCreator
            ? "Your team plan has expired. Please activate your plan first."
            : "Team plan has expired. Please wait for admin to activate the plan.",
        });
      }
    }

    const task = team.tasks.id(taskId);
    if (!task) {
      return res.status(404).json({
        success: false,
        message: "Task not found",
      });
    }

    const previousStatus = task.status;

    if (status) {
      task.status = status;
      if (status === "completed") {
        task.completedAt = new Date();

        // Handle earning distribution when task is completed
        if (
          task.amount &&
          task.amount > 0 &&
          task.assignedTo &&
          previousStatus !== "completed"
        ) {
          try {
            // Get assigned user
            const assignedUser = await UserModel.findById(task.assignedTo);
            if (assignedUser) {
              // Fetch task completion tax from SiteSettings (default 2%)
              let taskCompletionTax = 2;
              const settings = await SiteSettings.findOne();
              if (settings && typeof settings.taskCompletionTax === "number") {
                taskCompletionTax = settings.taskCompletionTax;
              }

              // Calculate tax and net amount
              const taxAmount = (task.amount * taskCompletionTax) / 100;
              const netAmount = task.amount - taxAmount;

              // Update assigned user's earnings
              assignedUser.totalEarnings += netAmount;

              // Add earning log
              if (!assignedUser.EarningLogs) {
                assignedUser.EarningLogs = [];
              }
              assignedUser.EarningLogs.push({
                amount: netAmount,
                date: new Date(),
                reason: `Task completed: ${task.title}`
              });

              await assignedUser.save();

              // Send email to freelancer about earnings
              await sendEarningUpdateEmail(
                assignedUser.email,
                assignedUser.username || assignedUser.Fullname,
                netAmount,
                'increment',
                `Payment for completing task: "${task.title}"`
              );

              // ✅ Transaction Log: Task completion payment
              try {
                await Transaction.create({
                  user: assignedUser._id,
                  counterparty: team.createdBy,
                  type: "credit",
                  amount: netAmount,
                  balanceAfter: assignedUser.totalEarnings,
                  category: "task_payment",
                  taskId: task._id.toString(),
                  teamId: team._id,
                  description: `Payment for completing task: ${task.title}`,
                  taxAmount: taxAmount,
                  taxPercent: taskCompletionTax,
                  grossAmount: task.amount,
                });
              } catch (txErr) {
                console.error("Transaction log error:", txErr);
              }
            }
          } catch (earningError) {
            console.error("Error updating user earnings:", earningError);
          }
        }

        team.chat.push(systemMessage);

        // Send task completion email to relevant parties
        // Notify the creator/admin
        const creator = await UserModel.findById(team.createdBy);
        if (creator) {
          await sendTaskStatusUpdateEmail(
            creator.email,
            creator.username || creator.Fullname,
            task.title,
            team.name,
            'completed'
          );
        }
      } else if (status === "cancelled") {
        // Add system message for cancellation
        const systemMessage = {
          sender: userId,
          message: `🚫 Task cancelled: "${task.title}"`,
          timestamp: new Date(),
          isAdmin: true,
          isSystemMessage: true,
        };
        team.chat.push(systemMessage);

        // Notify the assigned user if any
        if (task.assignedTo) {
          const assignedUser = await UserModel.findById(task.assignedTo);
          if (assignedUser) {
            await sendTaskStatusUpdateEmail(
              assignedUser.email,
              assignedUser.username || assignedUser.Fullname,
              task.title,
              team.name,
              'cancelled'
            );
          }
        }

        // --- REFUND LOGIC FOR CANCELLED TASK ---
        if (
          task.amount &&
          task.amount > 0 &&
          previousStatus !== "cancelled" &&
          previousStatus !== "completed"
        ) {
          try {
            // Find who to refund:payerId should be set in createTeamTask, fallback to team creator
            const refundRecipientId = task.payerId || team.createdBy;
            const recipientUser = await UserModel.findById(refundRecipientId);

            if (recipientUser) {
              // Increment balance
              recipientUser.totalEarnings += task.amount;

              // Add earning log for refund
              if (!recipientUser.EarningLogs) recipientUser.EarningLogs = [];
              recipientUser.EarningLogs.push({
                amount: task.amount,
                date: new Date(),
                reason: `Task cancelled refund: ${task.title}`
              });

              await recipientUser.save();

              // Send email notification for refund
              await sendEarningUpdateEmail(
                recipientUser.email,
                recipientUser.username || recipientUser.Fullname,
                task.amount,
                'increment',
                `Refund for cancelled task: "${task.title}"`
              );
              
              // Add a system message about the refund
              const refundMessage = {
                sender: userId,
                message: `💰 Amount $${task.amount} has been refunded to ${recipientUser.username || recipientUser.Fullname}`,
                timestamp: new Date(),
                isAdmin: true,
                isSystemMessage: true,
              };
              team.chat.push(refundMessage);
            }
          } catch (refundError) {
            console.error("Error processing task cancellation refund:", refundError);
          }
        }
      }
    }

    await team.save();

    // Populate team data for response
    const populatedTeam = await TeamHub.findById(teamId)
      .populate("chat.sender", "username email profilePicture")
      .populate("members.user", "username email profilePicture")
      .populate("createdBy", "username email profilePicture");

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      task: task,
      team: populatedTeam,
    });
  } catch (error) {
    console.error("Error updating team task:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating task",
      error: error.message,
    });
  }
};


export const updateTeamSettings = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { settings } = req.body;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Only creator and admins can update settings
    const isCreator =
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId;
    const isAdmin = team.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === "admin"
    );

    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Only team creator and admins can update settings",
      });
    }

    // Check team plan status for creator
    const planStatus = await checkTeamPlanStatus(team.createdBy.toString());
    if (planStatus.isExpired) {
      return res.status(403).json({
        success: false,
        message: isCreator
          ? "Your team plan has expired. Please activate your plan first."
          : "Team plan has expired. Please wait for admin to activate the plan.",
      });
    }

    // Update settings
    if (settings) {
      team.settings = { ...team.settings, ...settings };
    }

    await team.save();

    res.status(200).json({
      success: true,
      message: "Team settings updated successfully",
      team: team,
    });
  } catch (error) {
    console.error("Error updating team settings:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while updating team settings",
      error: error.message,
    });
  }
};

export const leaveTeam = async (req, res) => {
  try {
    const { teamId } = req.params;
    const userId = req.user.id;

    const team = await TeamHub.findById(teamId);
    if (!team) {
      return res.status(404).json({
        success: false,
        message: "Team not found",
      });
    }

    // Check if user is a member of the team
    const memberIndex = team.members.findIndex(
      (member) =>
        member.user.toString() === userId.toString() || member.user === userId
    );

    if (memberIndex === -1) {
      return res.status(403).json({
        success: false,
        message: "You are not a member of this team",
      });
    }

    // Creator cannot leave the team
    if (
      team.createdBy.toString() === userId.toString() ||
      team.createdBy === userId
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Team creator cannot leave the team. Please transfer ownership or delete the team instead.",
      });
    }

    // Remove the member from the team
    team.members.splice(memberIndex, 1);
    await team.save();

    res.status(200).json({
      success: true,
      message: "Successfully left the team",
    });
  } catch (error) {
    console.error("Error leaving team:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while leaving team",
      error: error.message,
    });
  }
};

// --- Notification Logic for Bell (No new model used) ---

export const getTeamHubFreelancerNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find teams where user was recently added (all their teams)
    const teams = await TeamHub.find({
      "members.user": userId
    }).select("name createdBy members createdAt");

    // 2. Find tasks assigned to them
    const tasks = await TeamHub.find({
      "tasks.assignedTo": userId
    }).select("name tasks");

    let notifications = [];

    // Add team addition notifications
    teams.forEach(team => {
      const memberInfo = team.members.find(m => m.user.toString() === userId.toString());
      notifications.push({
        id: `team_add_${team._id}`,
        teamId: team._id,
        teamName: team.name,
        type: "team_added",
        title: "Added to Team",
        message: `You were added to the team "${team.name}"`,
        createdAt: memberInfo?.joinedAt || team.createdAt
      });
    });

    // Add task assignment notifications
    tasks.forEach(team => {
      team.tasks.forEach(task => {
        if (task.assignedTo && task.assignedTo.toString() === userId.toString()) {
          notifications.push({
            id: `task_assign_${task._id}`,
            taskId: task._id,
            teamId: team._id,
            teamName: team.name,
            type: "task_assigned",
            title: "New Task Assigned",
            message: `You have a new task: "${task.title}" in ${team.name}`,
            taskTitle: task.title,
            status: task.status,
            createdAt: task.createdAt
          });
        }
      });
    });

    // 3. Find status updates for tasks
    const statusUpdatedTasks = await TeamHub.find({
      "members.user": userId,
      "tasks.status": { $in: ["completed", "cancelled"] }
    }).select("name tasks");

    statusUpdatedTasks.forEach(team => {
      team.tasks.forEach(task => {
        if (task.status === "completed" || task.status === "cancelled") {
          // If assigned to them, notify them
          if (task.assignedTo && task.assignedTo.toString() === userId.toString()) {
             notifications.push({
              id: `task_update_${task._id}_${task.status}`,
              taskId: task._id,
              teamId: team._id,
              teamName: team.name,
              type: "task_status_update",
              title: `Task ${task.status.charAt(0).toUpperCase() + task.status.slice(1)}`,
              message: `Task "${task.title}" was ${task.status} in team "${team.name}"`,
              taskTitle: task.title,
              status: task.status,
              createdAt: task.completedAt || task.createdAt
            });
          }
        }
      });
    });

    // 4. Find recent earnings
    const userForEarnings = await UserModel.findById(userId).select("EarningLogs");
    if (userForEarnings && userForEarnings.EarningLogs) {
      userForEarnings.EarningLogs.forEach((log, index) => {
        // Show last 5 earnings or ones from last 7 days
        const logDate = new Date(log.date);
        const now = new Date();
        const diffDays = Math.ceil(Math.abs(now - logDate) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 7) {
          notifications.push({
            id: `earning_${userId}_${index}`,
            type: "earning_update",
            title: log.amount >= 0 ? "Funds Added" : "Funds Deducted",
            message: `${log.amount >= 0 ? 'Received' : 'Deducted'} $${Math.abs(log.amount)}: ${log.reason || 'Account update'}`,
            amount: log.amount,
            createdAt: log.date
          });
        }
      });
    }

    // Sort by newest
    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error("Error fetching TeamHub freelancer notifications:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const getTeamHubClientNotifications = async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Find teams created by user (Client/Admin)
    const teams = await TeamHub.find({
      $or: [
        { createdBy: userId },
        { "members.user": userId, "members.role": "admin" }
      ]
    }).populate("tasks.assignedTo", "username Fullname");

    let notifications = [];

    // 2. Task status updates
    teams.forEach(team => {
      team.tasks.forEach(task => {
        // We notify about completed or cancelled tasks
        if (task.status === "completed" || task.status === "cancelled") {
          notifications.push({
            id: `task_update_${task._id}_${task.status}`,
            taskId: task._id,
            teamId: team._id,
            teamName: team.name,
            type: "task_status_update",
            title: `Task ${task.status.charAt(0).toUpperCase() + task.status.slice(1)}`,
            message: `Task "${task.title}" was ${task.status} in team "${team.name}"`,
            taskTitle: task.title,
            status: task.status,
            updatedBy: task.assignedTo?.username || "A member",
            createdAt: task.completedAt || task.createdAt // Use completedAt if available
          });
        }
      });
    });

    // 3. Earning updates (Recent 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const userForEarnings = await UserModel.findById(userId).select("EarningLogs");
    
    if (userForEarnings && userForEarnings.EarningLogs) {
      userForEarnings.EarningLogs.forEach((log, index) => {
        const logDate = new Date(log.date);
        if (logDate >= sevenDaysAgo) {
          notifications.push({
            id: `earning_${userId}_${index}`,
            type: "earning_update",
            title: log.amount >= 0 ? "Earning Received" : "Funds Deducted",
            message: log.reason || (log.amount >= 0 ? "You have a new earning." : "Amount deducted from your total balance."),
            amount: log.amount,
            createdAt: log.date
          });
        }
      });
    }

    notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.status(200).json({
      success: true,
      data: notifications
    });
  } catch (error) {
    console.error("Error fetching TeamHub client notifications:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};
