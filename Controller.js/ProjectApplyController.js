import mongoose from "mongoose";
import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectApplyModel from "../Model/ProjectApplyModel.js";
import UserModel from "../Model/UserModel.js";
import PlanPurchaseModel from "../Model/PlanPurchaseModel.js";
import sanitize from "mongo-sanitize";
import asyncHandler from "express-async-handler";
import { 
  sendContentWarningEmail, 
  sendAccountSuspensionEmail,
  sendProjectApplicationEmail
} from "../services/EmailService.js";
import { successResponse, errorResponse } from "../utils/responseHandler.js";
import { containsInappropriateContent } from "../utils/contentValidator.js";
import { analyzeContentQuality as getQualityScore, isAIGeneratedContentData } from "../utils/contentAnalyzer.js";

// === Inappropriate Content Violation Helper ===
const handleViolation = async (userId, content, violationType) => {
  const user = await UserModel.findById(userId);
  if (!user) return { suspended: false, warningCount: 0 };

  if (!user.warnings?.inappropriateContent) {
    user.warnings = { ...user.warnings, inappropriateContent: { count: 0, warningHistory: [] } };
  }

  user.warnings.inappropriateContent.count += 1;
  user.warnings.inappropriateContent.lastWarningDate = new Date();
  user.warnings.inappropriateContent.warningHistory.push({
    date: new Date(),
    reason: violationType,
    content: content.substring(0, 100),
  });

  const warningCount = user.warnings.inappropriateContent.count;
  if (warningCount >= 2) {
    user.accountStatus = "suspended";
    await user.save();
    await sendAccountSuspensionEmail(user.email, user.Fullname || user.username);
    return { suspended: true, warningCount };
  } else {
    await user.save();
    await sendContentWarningEmail(user.email, user.Fullname || user.username, warningCount);
    return { suspended: false, warningCount };
  }
};

// @desc    Apply to a project
// @route   POST /api/v1/apply/apply
// @access  Private
export const applyToProject = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { projectId, description, skills } = req.body;
  const sanitizedDescription = sanitize(description);
  const sanitizedSkills = sanitize(skills);

  // Content Validation
  if (containsInappropriateContent(sanitizedDescription) || containsInappropriateContent(sanitizedSkills)) {
    const violation = await handleViolation(userId, sanitizedDescription || sanitizedSkills, "Inappropriate content in application");
    
    if (violation.suspended) {
      return errorResponse(res, "Your account has been suspended due to repeated inappropriate content violations.", 403, "ACCOUNT_SUSPENDED");
    }

    return res.status(400).json({
      success: false,
      message: `Warning ${violation.warningCount}/2: Your proposal contains inappropriate content. ${violation.warningCount === 1 ? "First warning." : "Final warning!"}`,
      code: "INAPPROPRIATE_CONTENT",
      warningCount: violation.warningCount,
      isWarning: true
    });
  }

  if (!mongoose.Types.ObjectId.isValid(projectId)) return errorResponse(res, "Invalid project ID", 400);

  const project = await PostProjectModel.findById(projectId);
  if (!project) return errorResponse(res, "Project not found", 404);
  if (project.status?.toLowerCase() !== "open") return errorResponse(res, "Project is no longer open for applications", 400);

  const alreadyApplied = await ProjectApplyModel.exists({ user: userId, project: projectId });
  if (alreadyApplied) return errorResponse(res, "You have already applied to this project", 400, "DUPLICATE_APPLICATION");

  // Plan & Limit check
  const latestPlan = await PlanPurchaseModel.findOne({ user: userId, status: "approved" }).populate("plan").sort({ submittedAt: -1 });
  
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const endOfToday = new Date().setHours(23, 59, 59, 999);
  const dailyCount = await ProjectApplyModel.countDocuments({ user: userId, appliedAt: { $gte: startOfToday, $lte: endOfToday } });

  let dailyLimit = 6;
  if (latestPlan?.plan) {
    dailyLimit = (latestPlan.plan.maxprojectPerDay || 0) * 2;
  } else {
    const hasActiveProject = await ProjectApplyModel.exists({ user: userId, status: "hired" });
    dailyLimit = hasActiveProject ? 6 : 10;
  }

  if (dailyCount >= dailyLimit) {
    return errorResponse(res, `Daily limit of ${dailyLimit} applications reached.`, 403, "DAILY_LIMIT_REACHED");
  }

  const newApplication = await ProjectApplyModel.create({
    user: userId,
    project: projectId,
    description: sanitizedDescription || "",
    skills: sanitizedSkills?.split(",").map(s => s.trim()).filter(Boolean) || [],
    IsPlanActive: latestPlan?._id || null,
  });

  // Async Email (don't await to avoid delaying response)
  UserModel.findById(project.client).then(owner => {
    if (owner) {
      const link = `${process.env.CLIENT_URL || "http://localhost:3000"}/Fworkk/user/dashboard/client/projectdetail/${projectId}`;
      sendProjectApplicationEmail(owner, req.user, project, link).catch(() => {});
    }
  });

  return successResponse(res, { applicationId: newApplication._id, appliedAt: newApplication.appliedAt }, "Application submitted successfully", 201);
});

// @desc    Get all applied projects
// @route   GET /api/v1/apply/applied-projects
// @access  Private
export const getAppliedProjects = asyncHandler(async (req, res) => {
  const sortBy = req.query.sortBy || "appliedAt";
  const sortOrder = req.query.order === "asc" ? 1 : -1;
  const validSortFields = ["appliedAt", "budget"]; // restricted sort fields
  const sortField = validSortFields.includes(sortBy) ? sortBy : "appliedAt";

  const applications = await ProjectApplyModel.find({ user: req.user.id })
    .populate({
      path: "project",
      select: "title description budget deadline client category location skillsRequired createdAt",
      populate: { path: "client", select: "name rating projectsCompleted createdAt" }
    })
    .sort({ [sortField]: sortOrder });

  const result = applications.map(app => ({
    _id: app.project?._id,
    title: app.project?.title,
    description: app.project?.description,
    budget: app.project?.budget,
    deadline: app.project?.deadline,
    category: app.project?.category,
    location: app.project?.location || "Remote",
    skillsRequired: app.project?.skillsRequired,
    createdAt: app.project?.createdAt,
    client: app.project?.client,
    application: {
      projectId: app.project?._id,
      status: app.status,
      appliedAt: app.appliedAt,
      updatedAt: app.updatedAt,
      interviewStage: null // Schema need update if interview stage tracking exists
    }
  })).filter(item => item._id); // Filter out nulls if project was deleted

  return successResponse(res, result);
});

// @desc    Get detailed project information
// @route   GET /api/v1/apply/:id
// @access  Private
export const getProjectDetails = asyncHandler(async (req, res) => {
  const projectId = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(projectId)) return errorResponse(res, "Invalid project ID", 400);

  const project = await PostProjectModel.findById(projectId).lean();
  if (!project) return errorResponse(res, "Project not found", 404);

  const [client, application] = await Promise.all([
    UserModel.findById(project.client).select("Fullname email profileImage createdAt username").lean(),
    ProjectApplyModel.findOne({ user: req.user.id, project: projectId }).lean()
  ]);

  const formatDate = (date) => date ? new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A";

  const responseData = {
    id: project._id,
    title: project.title,
    description: project.description,
    budget: project.budget,
    duration: project.deadline ? formatDate(project.deadline) : "Not specified",
    category: project.category,
    skillsRequired: project.skillsRequired || [],
    status: project.status,
    createdAt: formatDate(project.createdAt),
    client: client ? {
      id: client._id,
      name: client.Fullname,
      username: client.username,
      email: client.email,
      profileImage: client.profileImage,
      memberSince: formatDate(client.createdAt),
    } : null,
    application: application ? {
      id: application._id,
      description: application.description,
      skills: application.skills,
      status: application.status,
      applicationDate: formatDate(application.appliedAt || application.applicationDate),
    } : null,
  };

  return successResponse(res, responseData);
});

// @desc    Check if user has any hired applications
// @route   GET /api/v1/apply/applications/hired
// @access  Private
export const checkHiredApplications = asyncHandler(async (req, res) => {
  const hiredApplications = await ProjectApplyModel.find({ user: req.user.id, status: "hired" })
    .populate({ path: "project", select: "title client status budget description" });

  const hiredProjects = hiredApplications.map(app => ({
    applicationId: app._id,
    projectId: app.project?._id,
    projectTitle: app.project?.title,
    clientId: app.project?.client,
    projectStatus: app.project?.status,
    applicationStatus: app.status,
    hiredDate: app.updatedAt,
    budget: app.project?.budget,
    description: app.project?.description,
  }));

  return successResponse(res, hiredProjects, hiredProjects.length > 0 ? "Hired projects found" : "No hired projects found");
});

// @desc    Get count of applicants for each project
// @route   GET /api/v1/apply/projects/applicants-count
// @access  Public
export const getApplicantsCountForProjects = asyncHandler(async (req, res) => {
  const projects = await PostProjectModel.find().lean();
  const result = await Promise.all(projects.map(async (p) => ({
    projectId: p._id,
    title: p.title,
    applicantsCount: await ProjectApplyModel.countDocuments({ project: p._id })
  })));

  return successResponse(res, result);
});

// @desc    Get detailed list of applicants for each project
// @route   GET /api/v1/apply/applicants-details/:projectId
// @access  Private
export const getApplicantsDetailsByProject = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) return errorResponse(res, "Invalid project ID", 400);

  // Verify project ownership (Security Fix)
  const project = await PostProjectModel.findById(projectId).select('client');
  if (!project) return errorResponse(res, "Project not found", 404);
  
  if (project.client.toString() !== req.user.id) {
    return errorResponse(res, "Not authorized to view applicants for this project", 403);
  }

  const applications = await ProjectApplyModel.find({ project: projectId })
    .populate({
      path: "user",
      select: "Fullname email username profileImage completedProjects rating skills createdAt",
    })
    .lean();

  const baseUrl = process.env.BASE_URL || "http://localhost:8080";
  const applicants = applications.map((app) => ({
    _id: app._id,
    user: {
      ...app.user,
      profileImage: app.user?.profileImage
        ? app.user.profileImage.startsWith("http") ? app.user.profileImage : `${baseUrl}${app.user.profileImage}`
        : null,
    },
    project: project, // Return minimal project info if needed, or app.project if populated
    IsPlanActive: app.IsPlanActive,
    description: app.description,
    cvFile: app.cvFile ? `${baseUrl}${app.cvFile}` : null,
    skills: app.skills,
    status: app.status,
    appliedAt: app.applicationDate || app.appliedAt,
    updatedAt: app.updatedAt,
  }));

  return successResponse(res, applicants, "Applicants details fetched successfully");
});

// @desc    Check if user has already applied to a project
// @route   GET /api/v1/apply/check-application/:projectId
// @access  Private
export const checkIfUserApplied = asyncHandler(async (req, res) => {
  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) return errorResponse(res, "Invalid project ID", 400);

  const application = await ProjectApplyModel.findOne({ user: req.user.id, project: projectId });
  return res.status(200).json({ success: true, hasApplied: !!application });
});

// @desc    Get all applications for client's projects
// @route   GET /api/v1/apply/applications-for-client
// @access  Private
export const getApplicationsForClient = asyncHandler(async (req, res) => {
  const clientProjects = await PostProjectModel.find({ client: req.user.id }).select("_id title");
  if (clientProjects.length === 0) return successResponse(res, [], "No projects found for this client");

  const projectIds = clientProjects.map((p) => p._id);
  const applications = await ProjectApplyModel.find({ project: { $in: projectIds } })
    .populate("user", "Fullname email username profileImage skills")
    .populate("project", "title")
    .sort({ appliedAt: -1 });

  return successResponse(res, applications);
});

// @desc    Calculate real-time match percentage
// @route   POST /api/v1/apply/calculate-match
// @access  Private
export const calculateMatchPercentage = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { projectId, description, skills } = req.body;

  const [user, project] = await Promise.all([
    UserModel.findById(userId).lean(),
    PostProjectModel.findById(projectId).lean()
  ]);

  if (!user || !project) return errorResponse(res, "User or Project not found", 404);

  const projectSkills = project.skillsRequired || [];
  const userSkills = user.skills || [];
  const applicationSkills = (skills || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  
  const analysis = {
    skillMatch: 0,
    contentQuality: 0,
    experienceMatch: 0,
    portfolioRelevance: 0,
    bioRelevance: 0,
    rating: user.rating || 0,
    aiGenerated: isAIGeneratedContentData(description)
  };

  // 1. Skill Match (40% weight)
  const matchingSkills = projectSkills.filter(ps => 
    userSkills.some(us => us.toLowerCase() === ps.toLowerCase()) ||
    applicationSkills.includes(ps.toLowerCase())
  );
  analysis.skillMatch = projectSkills.length > 0 ? (matchingSkills.length / projectSkills.length) * 100 : 100;

  // 2. Content Quality (20% weight)
  analysis.contentQuality = getQualityScore(description, analysis.aiGenerated);

  // 3. Experience Match (15% weight)
  const completed = user.completedProjects || 0;
  analysis.experienceMatch = completed >= 10 ? 100 : completed >= 5 ? 80 : completed >= 1 ? 60 : 40;

  // 4. Portfolio (15% weight)
  analysis.portfolioRelevance = (user.portfolio?.length > 0) ? 80 : 0;

  // 5. Bio (5% weight)
  analysis.bioRelevance = user.bio ? 70 : 0;

  const totalScore = (analysis.skillMatch * 0.4) + (analysis.contentQuality * 0.2) + 
                     (analysis.experienceMatch * 0.15) + (analysis.portfolioRelevance * 0.15) + 
                     (analysis.bioRelevance * 0.05) + (analysis.rating * 0.05);

  const score = Math.round(totalScore);
  const levels = [
    { min: 90, label: "Legendary", emoji: "🏆", msg: "Exceptional match!" },
    { min: 80, label: "Excellent", emoji: "🎉", msg: "Excellent match!" },
    { min: 70, label: "Good", emoji: "👍", msg: "Good match!" },
    { min: 50, label: "Fair", emoji: "🤔", msg: "Fair match." },
    { min: 0, label: "Poor", emoji: "😔", msg: "Low match." }
  ];
  const level = levels.find(l => score >= l.min);

  return successResponse(res, {
    percentage: score,
    matchLevel: level.label,
    emoji: level.emoji,
    message: level.msg,
    analysis,
    matchedSkills: matchingSkills.length,
    totalSkills: projectSkills.length
  });
});

// @desc    Delete a specific applicant's proposal (Admin)
export const deleteApplicantProposalAdmin = asyncHandler(async (req, res) => {
  const { projectId, applicationId } = req.params;
  
  const application = await ProjectApplyModel.findById(applicationId).populate('user project');
  if (!application) return errorResponse(res, "Proposal not found", 404);

  sendContentWarningEmail(application.user.email, application.user.Fullname || application.user.username, 1).catch(() => {});

  await ProjectApplyModel.findByIdAndDelete(applicationId);

  return successResponse(res, null, "Proposal deleted successfully");
});

// @desc    Get hire notifications for freelancer
export const getHireNotifications = asyncHandler(async (req, res) => {
  const notifications = await ProjectApplyModel.find({ user: req.user.id, status: "hired" })
    .populate({
      path: "project",
      select: "title description budget status category skillsRequired deadline client createdAt",
      populate: { path: "client", select: "username email profileImage" }
    })
    .sort({ updatedAt: -1 })
    .limit(20);

  return successResponse(res, notifications);
});

// @desc    Cancel a hired project (Freelancer)
export const cancelHiredProject = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { cancellationReason, cancellationDetails } = req.body;

  const application = await ProjectApplyModel.findOne({ _id: applicationId, user: req.user.id });
  if (!application) return errorResponse(res, "Application not found", 404);
  if (!["hired", "in-progress"].includes(application.status)) {
    return errorResponse(res, "Application must be hired or in-progress to cancel", 400);
  }

  application.status = "cancelled";
  application.cancellationReason = cancellationReason || "Freelancer cancelled";
  application.cancellationDetails = cancellationDetails || "";
  await application.save();

  await PostProjectModel.findByIdAndUpdate(application.project, { status: "open" });

  return successResponse(res, null, "Project cancelled successfully");
});

// @desc    Get cancelled projects for a user
export const getCancelledProjectsForUser = asyncHandler(async (req, res) => {
  const apps = await ProjectApplyModel.find({
    user: req.params.userId,
    status: { $in: ["cancelled", "hired", "in-progress"] }
  }).populate("project").sort({ updatedAt: -1 });

  const cancelled = apps.filter(a => a.status === "cancelled" || a.project?.status === "cancelled");
  return successResponse(res, cancelled);
});
