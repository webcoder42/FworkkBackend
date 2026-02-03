import SubmitProjectModel from "../Model/SubmitProjectModel.js";
import PostProjectModel from "../Model/PostProjectModel.js";
import UserModel from "../Model/UserModel.js";
import Transaction from "../Model/TransactionModel.js";
import { 
  sendProjectSubmissionEmailToOwner, 
  sendProjectSubmissionEmailToFreelancer,
  sendSubmissionRejectionEmail,
  sendSubmissionApprovalEmail,
  sendEarningUpdateEmail
} from "../services/EmailService.js";
import sanitize from "mongo-sanitize";
import { redisClient } from "../server.js";

// Helper to persist successful responses into Redis when cache middleware set a key
const saveToCache = async (res, payload) => {
  if (!res.locals?.cacheKey) return;

  try {
    await redisClient.set(res.locals.cacheKey, JSON.stringify(payload), {
      EX: res.locals.cacheTTL || 60,
    });
    console.log("💾 Saving to Redis:", res.locals.cacheKey);
  } catch (err) {
    console.error("❌ Redis save error:", err);
  }
};


// 1. Submit or Update Project
export const submitProject = async (req, res) => {
  const { githubLink, liveSiteUrl, description, githubRepo, submissionType: reqSubmissionType } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const projectId = req.params.projectId;

  // Check if at least one source is provided
  if (!githubLink && !liveSiteUrl && !githubRepo) {
    return res.status(400).json({
      success: false,
      error: "At least one source (GitHub Link, Live Site, or GitHub Repo) is required",
    });
  }

  if (!description) {
    return res.status(400).json({
      success: false,
      error: "Description is required",
    });
  }

  // Validate GitHub URL if provided manually
  if (githubLink) {
    const githubUrlRegex = /^https?:\/\/github\.com\/[^/]+\/[^/]+$/;
    if (!githubUrlRegex.test(githubLink)) {
      return res.status(400).json({
        success: false,
        error: "Invalid GitHub URL",
      });
    }
  }

  // Validate Live Site URL if provided
  if (liveSiteUrl) {
    const urlRegex = /^https?:\/\/.+/;
    if (!urlRegex.test(liveSiteUrl)) {
      return res.status(400).json({
        success: false,
        error: "Invalid Live Site URL",
      });
    }
  }

  try {
    // Find project and populate the owner details
    const project = await PostProjectModel.findById(projectId).populate(
      "client",
      "Fullname username email"
    );
    if (!project) {
      return res.status(404).json({
        success: false,
        error: "Project not found",
      });
    }

    // Get submitter details
    const submitter = await UserModel.findById(userId, "Fullname username email");

    // Determine submission type if not provided
    let submissionType = reqSubmissionType || "github_link";
    if (githubRepo) {
      submissionType = "github_repo";
    } else if (githubLink && liveSiteUrl) {
      submissionType = "both";
    } else if (liveSiteUrl && !githubLink) {
      submissionType = "live_site";
    }

    // Create/update submission data
    const updateData = {
      submissionType,
      description,
      status: "submitted",
      submittedAt: new Date(),
    };

    if (githubLink) updateData.githubLink = githubLink;
    if (liveSiteUrl) updateData.liveSiteUrl = liveSiteUrl;
    if (githubRepo) updateData.githubRepo = githubRepo;

    // Create/update submission
    const submission = await SubmitProjectModel.findOneAndUpdate(
      { user: userId, project: projectId },
      updateData,
      { new: true, upsert: true }
    );

    // Prepare email content
    let linksSection = "";
    if (submissionType === "github_repo" && githubRepo) {
      linksSection = `<p><strong>GitHub Repository:</strong> <a href="${githubRepo.url}">${githubRepo.fullName}</a> (Branch: ${githubRepo.branch || 'main'})</p>`;
    } else if (githubLink && liveSiteUrl) {
      linksSection = `
        <p><strong>GitHub Link:</strong> <a href="${githubLink}">${githubLink}</a></p>
        <p><strong>Live Site URL:</strong> <a href="${liveSiteUrl}">${liveSiteUrl}</a></p>
      `;
    } else if (githubLink) {
      linksSection = `<p><strong>GitHub Link:</strong> <a href="${githubLink}">${githubLink}</a></p>`;
    } else if (liveSiteUrl) {
      linksSection = `<p><strong>Live Site URL:</strong> <a href="${liveSiteUrl}">${liveSiteUrl}</a></p>`;
    }

    // Send notifications in background or wrap in try/catch so failure doesn't block submission
    try {
      // 1. Email to Project Owner (Client)
      await sendProjectSubmissionEmailToOwner(project, submitter, submissionType, linksSection, description);
    } catch (emailError) {
      console.error("⚠️ Failed to send email to project owner:", emailError.message);
    }

    try {
      // 2. Email to Submitter (Freelancer)
      await sendProjectSubmissionEmailToFreelancer(project, submitter, githubLink, liveSiteUrl, description);
    } catch (emailError) {
      console.error("⚠️ Failed to send email to freelancer:", emailError.message);
    }

    return res.status(200).json({
      success: true,
      message: "Project submitted successfully and notifications sent",
      submission,
    });
  } catch (err) {
    console.error("❌ Submission Error:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to submit project",
    });
  }
};

// 2. Get Submission Details
export const getSubmissionDetails = async (req, res) => {
  try {
    console.log("🟢 DB HIT: getSubmissionDetails");

    const submission = await SubmitProjectModel.findOne({
      project: req.params.projectId,
      user: req.user.id,
    })
      .sort({ submittedAt: -1 })
      .populate("user", "name email")
      .populate("project", "title description");

    if (!submission) {
      const payload = {
        success: false,
        error: "Submission not found",
      };
      await saveToCache(res, payload);
      return res.status(404).json(payload);
    }

    const payload = {
      success: true,
      submission,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Failed to fetch submission",
    });
  }
};

export const checkUserProjectSubmission = async (req, res) => {
  try {
    const projectId = req.params.projectId;

    console.log("📌 Checking if any submission exists for project:");
    console.log("➡️ Project ID:", projectId);

    const submission = await SubmitProjectModel.findOne({
      project: projectId,
    })
      .sort({ submittedAt: -1 })
      .populate("user", "username name email rating completedProjects")
      .populate("project", "title description");

    if (!submission) {
      console.log("🚫 No submission found for this project.");
      const payload = {
        success: false,
        message: "No submission found for this project.",
      };
      await saveToCache(res, payload);
      return res.status(404).json(payload);
    }

    console.log("✅ Submission found:", submission._id);
    const payload = {
      success: true,
      message: "Submission found for this project.",
      submission,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error checking submission:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while checking project submission.",
    });
  }
};

// === Main Controller Function ===
export const updateSubmissionStatus = async (req, res) => {
  try {
    const { status, rating, comment, experience } = req.body;
    const projectId = req.params.id;

    const submission = await SubmitProjectModel.findOne({ project: projectId })
      .populate("project")
      .populate("user");

    if (!submission) {
      return res
        .status(404)
        .json({ success: false, message: "Submission not found" });
    }

    const user = submission.user;
    const project = submission.project;

    // === REJECTED FLOW ===
    if (status === "rejected") {
      submission.status = "rejected";
      await submission.save();

      await sendSubmissionRejectionEmail(user, project);

      return res.status(200).json({
        success: true,
        message: "Submission rejected and email sent",
        updatedSubmission: submission,
      });
    }

    // === APPROVED FLOW ===
    if (status === "approved") {
      if (!rating || !experience) {
        return res.status(400).json({
          success: false,
          message: "Rating and experience are required",
        });
      }

      if (rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ success: false, message: "Rating must be between 1 and 5" });
      }

      if (!["positive", "neutral", "negative"].includes(experience)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid experience value" });
      }

      const session = await SubmitProjectModel.startSession();
      session.startTransaction();

      try {
        submission.review = {
          rating,
          comment: comment || "",
          experience,
          createdAt: new Date(),
        };
        submission.status = "approved";
        await submission.save({ session });

        project.status = "completed";
        await project.save({ session });

        const submittingUser = await UserModel.findById(user._id).session(
          session
        );
        if (submittingUser) {
          const newRating =
            (submittingUser.rating * submittingUser.completedProjects +
              rating) /
            (submittingUser.completedProjects + 1);

          submittingUser.rating = parseFloat(newRating.toFixed(2));
          submittingUser.completedProjects += 1;

          if (project.budget) {
            submittingUser.totalEarnings += project.budget;

            // Add earning log for project completion
            submittingUser.EarningLogs = submittingUser.EarningLogs || [];
            submittingUser.EarningLogs.push({
              amount: project.budget,
              date: new Date(),
              reason: `Project completed: ${project.title}`
            });

            await submittingUser.save({ session });

            // Send earning update email
            await sendEarningUpdateEmail(
              submittingUser.email,
              submittingUser.username || submittingUser.Fullname,
              project.budget,
              'increment',
              `Payment for completing project: "${project.title}"`
            );

            // ✅ Transaction Log: Payment for project completion
            try {
              await Transaction.create({
                user: submittingUser._id,
                counterparty: project.client,
                type: "credit",
                amount: project.budget,
                balanceAfter: submittingUser.totalEarnings,
                category: "project_payment",
                projectId: project._id,
                description: `Payment received for completing project: ${project.title}`,
              });
            } catch (txErr) {
              console.error("Transaction log error:", txErr);
            }
          }
        }

        await session.commitTransaction();
        session.endSession();

        await sendSubmissionApprovalEmail(user, project, project.budget, rating, comment, experience);

        return res.status(200).json({
          success: true,
          message: "Submission approved and email sent",
          updatedSubmission: submission,
        });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
      }
    }

    // === INVALID STATUS ===
    return res
      .status(400)
      .json({ success: false, message: "Invalid status update" });
  } catch (error) {
    console.error("❌ Error updating submission status:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

export const checkUserApprovedSubmissions = async (req, res) => {
  try {
    const userId = req.params.userId;

    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Find all approved submissions for this user
    const approvedSubmissions = await SubmitProjectModel.find({
      user: userId,
      status: "approved",
    })
      .populate({
        path: "project",
        select: "title description budget", // Include any project fields you need
        model: PostProjectModel,
      })
      .populate({
        path: "user",
        select: "Fullname username email", // Include any user fields you need
        model: UserModel,
      })
      .sort({ submittedAt: -1 }); // Sort by most recent first

    if (approvedSubmissions.length === 0) {
      const payload = {
        success: true,
        hasApprovedSubmissions: false,
        message: "User has no approved project submissions",
        approvedSubmissions: [],
      };
      await saveToCache(res, payload);
      return res.status(200).json(payload);
    }

    const payload = {
      success: true,
      hasApprovedSubmissions: true,
      message: "User has approved project submissions",
      count: approvedSubmissions.length,
      approvedSubmissions,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error checking approved submissions:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to check approved submissions",
      details: err.message,
    });
  }
};

export const checkUserInProgressSubmissions = async (req, res) => {
  try {
    const userId = req.params.userId;
    // Check if user exists
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    // Find all in-progress (submitted) submissions for this user
    const inProgressSubmissions = await SubmitProjectModel.find({
      user: userId,
      status: "submitted",
    })
      .populate({
        path: "project",
        select: "title description budget",
        model: PostProjectModel,
      })
      .populate({
        path: "user",
        select: "Fullname username email",
        model: UserModel,
      })
      .sort({ submittedAt: -1 });
    const payload = {
      success: true,
      message: "User in-progress project submissions",
      count: inProgressSubmissions.length,
      inProgressSubmissions,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error checking in-progress submissions:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to check in-progress submissions",
      details: err.message,
    });
  }
};

// Get Project Submission Details for Client
export const getProjectSubmissionForClient = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const clientId = req.user.id;

    // Find the project and verify it belongs to the client
    const project = await PostProjectModel.findOne({
      _id: projectId,
      client: clientId,
    });

    if (!project) {
      const payload = {
        success: false,
        message: "Project not found or you don't have permission to view it",
      };
      await saveToCache(res, payload);
      return res.status(404).json(payload);
    }

    // Find the submission for this project
    const submission = await SubmitProjectModel.findOne({ project: projectId })
      .populate("user", "username email rating completedProjects")
      .populate("project", "title description budget status");

    if (!submission) {
      const payload = {
        success: true,
        submission: null,
        message: "No submitted work for this project yet.",
      };
      await saveToCache(res, payload);
      return res.status(200).json(payload);
    }

    const payload = {
      success: true,
      submission,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error fetching project submission:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch project submission",
    });
  }
};

// Get All Submissions for a Project (for Client)
export const getAllProjectSubmissionsForClient = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    const clientId = req.user.id;

    // Find the project and verify it belongs to the client
    const project = await PostProjectModel.findOne({
      _id: projectId,
      client: clientId,
    });

    if (!project) {
      const payload = {
        success: false,
        message: "Project not found or you don't have permission to view it",
      };
      await saveToCache(res, payload);
      return res.status(404).json(payload);
    }

    // Find all submissions for this project
    const submissions = await SubmitProjectModel.find({ project: projectId })
      .populate("user", "username email rating completedProjects")
      .populate("project", "title description budget status")
      .sort({ submittedAt: -1 });

    const payload = {
      success: true,
      data: submissions,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error fetching project submissions:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch project submissions",
    });
  }
};

// Get All Work Submissions for a Client (for Notifications)
export const getClientWorkSubmissions = async (req, res) => {
  try {
    const clientId = req.user.id;

    // 1. Find all projects owned by this client
    const clientProjects = await PostProjectModel.find({ client: clientId }).select('_id');
    
    if (!clientProjects || clientProjects.length === 0) {
      const payload = {
        success: true,
        data: [],
      };
      await saveToCache(res, payload);
      return res.status(200).json(payload);
    }

    const projectIds = clientProjects.map(p => p._id);

    // 2. Find submissions for these projects
    // We filter for status 'submitted' or 'approved'/'rejected' if needed. 
    // Usually notifications are for 'submitted' (pending review) but user said "jab koi user... submit karta hai"
    // So we want to see recent submissions. 
    const submissions = await SubmitProjectModel.find({ 
      project: { $in: projectIds } 
    })
      .populate("user", "Fullname username email profilePhoto")
      .populate("project", "title")
      .sort({ submittedAt: -1 })
      .limit(20); // Limit to recent 20 for notifications

    const payload = {
      success: true,
      data: submissions,
    };
    await saveToCache(res, payload);

    return res.status(200).json(payload);
  } catch (err) {
    console.error("❌ Error fetching client work submissions:", err);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch client work submissions",
    });
  }
};
