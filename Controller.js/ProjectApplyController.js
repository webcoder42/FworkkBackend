import mongoose from "mongoose";
import PostProjectModel from "../Model/PostProjectModel.js";
import ProjectApplyModel from "../Model/ProjectApplyModel.js";
import UserModel from "../Model/UserModel.js";
import PlanPurchaseModel from "../Model/PlanPurchaseModel.js";
import sanitize from "mongo-sanitize";
import { 
  sendInappropriateApplicationDeletionEmail,
  sendContentWarningEmail, 
  sendAccountSuspensionEmail,
  sendProjectApplicationEmail
} from "../services/EmailService.js";
import dotenv from "dotenv";
import filter from "leo-profanity";
import { redisClient } from "../server.js";

dotenv.config();

// === Bad Words Filter Setup ===
// Add custom bad words (English + Urdu/Hindi)
const customBadWords = [
  // English inappropriate words
  "sex",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "damn",
  "bastard",
  "whore",
  "slut",
  // Urdu/Hindi inappropriate words
  "chutiya",
  "bhenchod",
  "madarchod",
  "randi",
  "harami",
  "kamina",
  "kutta",
  "saala",
  "behenchod",
  "gaandu",
  "randii",
  "bhen chod",
  "ma chod",
  "bhosdike",
  "lodu",
  "chodu",
  "kutiya",
  // Common variations
  "f*ck",
  "sh*t",
  "b*tch",
  "a**hole",
  "ch*tiya",
  "r*ndi",
];

// Add custom words to filter
filter.add(customBadWords);

// Function to check inappropriate content
const containsInappropriateContent = (text) => {
  if (!text || typeof text !== "string") return false;
  return filter.check(text.toLowerCase());
};

// Email functions removed and moved to EmailService.js

// Function to handle inappropriate content violation
const handleInappropriateContentViolation = async (
  userId,
  content,
  violationType
) => {
  try {
    // Get user details
    const user = await UserModel.findById(userId);
    if (!user) return { suspended: false, warningCount: 0 };

    // Initialize warnings if not exists
    if (!user.warnings || !user.warnings.inappropriateContent) {
      user.warnings = {
        inappropriateContent: {
          count: 0,
          warningHistory: [],
        },
      };
    }

    // Increment warning count
    user.warnings.inappropriateContent.count += 1;
    user.warnings.inappropriateContent.lastWarningDate = new Date();

    // Add to warning history
    user.warnings.inappropriateContent.warningHistory.push({
      date: new Date(),
      reason: violationType,
      content: content.substring(0, 100), // Store first 100 chars only
    });

    const warningCount = user.warnings.inappropriateContent.count;

    if (warningCount >= 2) {
      // Suspend account after 2 warnings
      user.accountStatus = "suspended";
      await user.save();

      // Send suspension email
      await sendAccountSuspensionEmail(user.email, user.Fullname || user.username);

      return { suspended: true, warningCount };
    } else {
      // Send warning email for first violation
      await user.save();
      await sendContentWarningEmail(
        user.email,
        user.Fullname || user.username,
        warningCount
      );

      return { suspended: false, warningCount };
    }
  } catch (error) {
    // (console removed)
    return { suspended: false, warningCount: 0 };
  }
};



// Apply to a project

export const applyToProject = async (req, res) => {
  try {
    // ✅ 1. Authentication check
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id;
    const projectId = req.body.projectId;
    const description = sanitize(req.body.description);
    const skills = sanitize(req.body.skills);
    const cvFilePath = null; // CV upload removed - always null

    // ✅ Content Validation - Check for inappropriate words
    if (containsInappropriateContent(description)) {
      // Handle violation and send warning/suspension
      const violation = await handleInappropriateContentViolation(
        userId,
        description,
        "Inappropriate content in project application description"
      );

      // (console removed)

      if (violation.suspended) {
        return res.status(403).json({
          success: false,
          message:
            "Your account has been suspended due to repeated inappropriate content violations. Please contact support.",
          code: "ACCOUNT_SUSPENDED",
          warningCount: violation.warningCount,
          forceLogout: true,
        });
      }

      return res.status(400).json({
        success: false,
        message: `Warning ${
          violation.warningCount
        }/2: Your proposal contains inappropriate content. ${
          violation.warningCount === 1
            ? "This is your first warning."
            : "This is your final warning - next violation will suspend your account!"
        } Please revise your description and try again.`,
        code: "INAPPROPRIATE_CONTENT_DESCRIPTION",
        warningCount: violation.warningCount,
        isWarning: true,
      });
    }

    if (containsInappropriateContent(skills)) {
      // Handle violation and send warning/suspension
      const violation = await handleInappropriateContentViolation(
        userId,
        skills,
        "Inappropriate content in project application skills"
      );

      // (console removed)

      if (violation.suspended) {
        return res.status(403).json({
          success: false,
          message:
            "Your account has been suspended due to repeated inappropriate content violations. Please contact support.",
          code: "ACCOUNT_SUSPENDED",
          warningCount: violation.warningCount,
          forceLogout: true,
        });
      }

      return res.status(400).json({
        success: false,
        message: `Warning ${
          violation.warningCount
        }/2: Your skills section contains inappropriate content. ${
          violation.warningCount === 1
            ? "This is your first warning."
            : "This is your final warning - next violation will suspend your account!"
        } Please revise and try again.`,
        code: "INAPPROPRIATE_CONTENT_SKILLS",
        warningCount: violation.warningCount,
        isWarning: true,
      });
    }

    // ✅ 2. Validate project ID
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // ✅ 3. Fetch project
    const project = await PostProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // ✅ 4. Check project status is "open"
    if (!project.status || project.status.toLowerCase() !== "open") {
      return res.status(400).json({
        success: false,
        message: `You can only apply to projects with status 'open'. Current status: '${
          project.status || "unknown"
        }'`,
      });
    }

    // ✅ 5. Check for duplicate application
    const alreadyApplied = await ProjectApplyModel.exists({
      user: userId,
      project: projectId,
    });
    if (alreadyApplied) {
      return res.status(400).json({
        success: false,
        message: "You can only apply once per project",
        code: "DUPLICATE_APPLICATION",
      });
    }

    // ✅ 6. Find latest approved plan
    const latestApprovedPlan = await PlanPurchaseModel.findOne({
      user: userId,
      status: "approved",
    }).sort({ submittedAt: -1 });

    // ✅ 7. Create new application
    const newApplication = await ProjectApplyModel.create({
      user: userId,
      project: projectId,
      description: description || "",
      cvFile: cvFilePath,
      skills:
        skills
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean) || [],
      applicationDate: new Date(),
      IsPlanActive: latestApprovedPlan ? latestApprovedPlan._id : null,
    });

    // ✅ 8. Send email notification to project owner
    try {
      const projectOwner = await UserModel.findById(project.client);
      const applicant = await UserModel.findById(userId);

      if (projectOwner && applicant) {
        const projectLink = `${
          process.env.CLIENT_URL || "http://localhost:3000"
        }/Fworkk/user/dashboard/client/projectdetail/${projectId}`;

        await sendProjectApplicationEmail(
          projectOwner,
          applicant,
          project,
          projectLink
        );
      }
    } catch (emailError) {
      // (console removed)
    }

    // ✅ 9. Respond with success
    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      data: {
        applicationId: newApplication._id,
        cvFile: cvFilePath
          ? `${process.env.BASE_URL || "http://localhost:8080"}${cvFilePath}`
          : null,
        appliedAt: newApplication.applicationDate,
      },
    });
  } catch (error) {
    if (
      error.message.includes("file type") ||
      error.message.includes("file size")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: "Application failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all applied projects
export const getAppliedProjects = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const cacheKey = `applied-projects:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const applications = await ProjectApplyModel.find({
      user: userId,
    }).populate({
      path: "project",
      match: { status: "open" },
    });

    const appliedProjects = applications
      .map((app) => app.project)
      .filter((project) => project !== null);

    const response = {
      success: true,
      message: "Open applied projects retrieved successfully",
      data: appliedProjects,
    };

    await redisClient.setEx(cacheKey, 30, JSON.stringify(response));
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch applied projects",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get detailed project information with application status
export const getProjectDetails = async (req, res) => {
  try {
    const cacheKey = `project-detail:${req.params.id}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    // Check authentication
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id;
    const projectId = req.params.id;

    // Validate project ID
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    // Find the project
    const project = await PostProjectModel.findById(projectId).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Find client details with proper field names from your UserModel
    let client = {
      Fullname: "Unknown Client",
      email: "",
      profileImage: "",
      createdAt: "",
      username: "",
    };

    if (project.client && mongoose.Types.ObjectId.isValid(project.client)) {
      const clientData = await UserModel.findById(project.client)
        .select("Fullname email profileImage createdAt username")
        .lean();
      if (clientData) {
        client = clientData;
      }
    }

    // Find the user's application
    const application = await ProjectApplyModel.findOne({
      user: userId,
      project: projectId,
    }).lean();

    // Format dates properly
    const formatDate = (date) => {
      if (!date) return "N/A";
      try {
        return new Date(date).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      } catch (e) {
        return "Invalid Date";
      }
    };

    // Prepare response data matching all your model fields
    const responseData = {
      id: project._id,
      title: project.title || "No title",
      description: project.description || "No description provided",
      budget: project.budget || 0,
      duration: project.deadline ? formatDate(project.deadline) : "Not specified",
      category: project.category || "Not specified",
      skillsRequired: project.skillsRequired || [],
      status: project.status || "unknown",
      createdAt: formatDate(project.createdAt),
      client: {
        id: client._id || "",
        name: client.Fullname || "Unknown Client",
        username: client.username || "",
        email: client.email || "",
        profileImage: client.profileImage || "",
        memberSince: formatDate(client.createdAt),
      },
      application: application
        ? {
            id: application._id,
            description: application.description || "No cover letter provided",
            cvFile: application.cvFile || "",
            skills: application.skills || [],
            status: application.status || "pending",
            applicationDate: formatDate(
              application.appliedAt || application.applicationDate
            ),
            updatedAt: formatDate(application.updatedAt),
          }
        : null,
    };

    res.status(200).json({
      success: true,
      message: "Project details retrieved successfully",
      data: responseData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch project details",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Check if user has any hired applications
export const checkHiredApplications = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id;
    const cacheKey = `hired-applications:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const hiredApplications = await ProjectApplyModel.find({
      user: userId,
      status: "hired",
    }).populate({
      path: "project",
      select: "title client status budget description",
    });

    const hiredProjects = hiredApplications.map((app) => ({
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

    const response = {
      success: true,
      message: hiredProjects.length > 0 ? "User has hired applications" : "No hired applications found for this user",
      data: hiredProjects,
    };

    await redisClient.setEx(cacheKey, 20, JSON.stringify(response));
    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to check hired applications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get count of applicants for each project
export const getApplicantsCountForProjects = async (req, res) => {
  try {
    // (console removed)
    const cacheKey = 'project-applicnat-count';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const projects = await PostProjectModel.find().lean();
    // (console removed)

    const result = await Promise.all(
      projects.map(async (project) => {
        const count = await ProjectApplyModel.countDocuments({
          project: project._id,
        });
        return {
          projectId: project._id,
          title: project.title,
          applicantsCount: count,
        };
      })
    );

    // (console removed)

    res.status(200).json({
      success: true,
      message: "Applicants count fetched for all projects",
      data: result,
    });
  } catch (error) {
    // (console removed)
    res.status(500).json({
      success: false,
      message: "Failed to fetch applicants count",
      error: error.message,
    });
  }
};

// Get detailed list of applicants for each project
export const getApplicantsDetailsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const cacheKey = `applicants-detail:${projectId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    const applications = await ProjectApplyModel.find({ project: projectId })
      .populate({
        path: "user",
        select:
          "Fullname email username profileImage completedProjects rating skills createdAt",
      })
      .lean();

    const applicants = applications.map((app) => ({
      _id: app._id,
      user: {
        ...app.user,
        profileImage: app.user.profileImage
          ? app.user.profileImage.startsWith("http")
            ? app.user.profileImage
            : `${process.env.BASE_URL || "http://localhost:8080"}${
                app.user.profileImage
              }`
          : null,
      },
      project: app.project,
      IsPlanActive: app.IsPlanActive,
      description: app.description,
      cvFile: app.cvFile
        ? `${process.env.BASE_URL || "http://localhost:8080"}${app.cvFile}`
        : null,
      skills: app.skills,
      status: app.status,
      appliedAt: app.applicationDate || app.appliedAt,
      updatedAt: app.updatedAt,
    }));

    res.status(200).json({
      success: true,
      message: "Applicants details fetched successfully",
      data: applicants,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch applicants details",
      error: error.message,
    });
  }
};

// Check if user has already applied to a project
export const checkIfUserApplied = async (req, res) => {
  try {
    const userId = req.user.id;
    const projectId = req.params.projectId;

    // Validate project ID
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid project ID",
      });
    }

    const cacheKey = `check-applicant:${userId}:${projectId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    // Check if application exists
    const application = await ProjectApplyModel.findOne({
      user: userId,
      project: projectId,
    });

    res.status(200).json({
      success: true,
      hasApplied: !!application,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to check application status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Get all applications for client's projects
export const getApplicationsForClient = async (req, res) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const clientId = req.user.id;
    const cacheKey = `client-applications:${clientId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);
    // (console removed)

    // Get all projects by this client
    const clientProjects = await PostProjectModel.find({
      client: clientId,
    }).select("_id title");
    // (console removed)

    if (clientProjects.length === 0) {
      // (console removed)
      return res.status(200).json({
        success: true,
        data: [],
        message: "No projects found for this client",
      });
    }

    const projectIds = clientProjects.map((project) => project._id);
    // (console removed)

    // Get all applications for these projects
    const applications = await ProjectApplyModel.find({
      project: { $in: projectIds },
    })
      .populate({
        path: "user",
        select: "username email profileImage completedProjects rating",
      })
      .populate({
        path: "project",
        select: "title client status",
      })
      .sort({ appliedAt: -1 });

    // (console removed)
    // (console removed)

    res.status(200).json({
      success: true,
      data: applications,
      message: "Applications fetched successfully",
    });
  } catch (error) {
    // (console removed)
    res.status(500).json({
      success: false,
      message: "Failed to fetch applications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ADMIN: Delete a specific applicant's proposal from a project
export const deleteApplicantProposalAdmin = async (req, res) => {
  try {
    const { projectId, applicationId } = req.params;

    // (console removed)

    // Validate ObjectIds
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      // (console removed)
      return res
        .status(400)
        .json({ success: false, message: "Invalid project ID format" });
    }

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
      // (console removed)
      return res
        .status(400)
        .json({ success: false, message: "Invalid application ID format" });
    }

    // (console removed)

    // Check if project exists
    const projectExists = await PostProjectModel.findById(projectId);
    // (console removed)

    // Check if application exists (using applicationId as application ID)
    const applicationExists = await ProjectApplyModel.findById(applicationId);
    // (console removed)

    // Check all applications for this project
    const allProjectApplications = await ProjectApplyModel.find({
      project: projectId,
    });
    // (console removed)
    // (console removed)
    // (console removed)

    // Fetch application by ID (not by project+user combination)
    const application = await ProjectApplyModel.findById(applicationId)
      .populate("user", "email username")
      .populate("project", "title");

    // (console removed)
    if (application) {
      // (console removed)

      // Verify this application belongs to the specified project
      if (application.project?._id?.toString() !== projectId) {
        // (console removed)
        return res.status(400).json({
          success: false,
          message: "Application doesn't belong to the specified project",
        });
      }
    }

    if (!application) {
      // (console removed)
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    const applicant = application.user;
    const project = application.project;

    // (console removed)
    // (console removed)
    // (console removed)

    // Email to applicant

    await sendInappropriateApplicationDeletionEmail(applicant, project);

    // Delete the application by ID
    // (console removed)
    const deleteResult = await ProjectApplyModel.findByIdAndDelete(
      applicationId
    );
    // (console removed)

    // (console removed)
    res.status(200).json({
      success: true,
      message: "Applicant's proposal deleted successfully, notification sent",
    });
  } catch (error) {
    // (console removed)
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Calculate real-time match percentage for project application
export const calculateMatchPercentage = async (req, res) => {
  try {
    const { projectId, description, skills } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // Get project details
    const project = await PostProjectModel.findById(projectId);
    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    // Get user details
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    let totalScore = 0;
    const analysis = {
      skillsMatch: 0,
      experienceLevel: 0,
      proposalQuality: 0,
      portfolioRelevance: 0,
      bioRelevance: 0,
      rating: 0,
      contentQuality: 0,
      aiGenerated: false,
    };

    // Check if content appears to be AI-generated
    const isAIGenerated = checkIfAIGenerated(description);
    analysis.aiGenerated = isAIGenerated;

    // 1. Skills Matching (25% weight) - Very generous scoring
    const projectSkills = project.skillsRequired || [];
    const userSkills = user.skills || [];
    const applicationSkills = skills
      ? skills.split(",").map((s) => s.trim())
      : [];

    const allUserSkills = [...new Set([...userSkills, ...applicationSkills])];

    // Enhanced skills matching with synonyms and variations
    const skillSynonyms = {
      javascript: ["js", "ecmascript", "es6", "es2015", "vanilla js"],
      react: ["reactjs", "react.js", "reactjs", "react native"],
      "node.js": ["nodejs", "node", "express", "express.js", "server"],
      python: ["py", "django", "flask", "fastapi"],
      html: ["html5", "markup", "semantic"],
      css: ["css3", "styling", "stylesheet", "scss", "sass"],
      php: ["php7", "php8", "laravel", "wordpress", "codeigniter"],
      java: ["j2ee", "spring", "android", "kotlin"],
      "c++": ["cpp", "c plus plus"],
      "c#": ["csharp", "dotnet", ".net", "asp.net"],
      sql: ["mysql", "postgresql", "database", "mongodb", "nosql"],
      mongodb: ["mongo", "nosql", "database"],
      aws: ["amazon web services", "cloud", "ec2", "s3"],
      docker: ["containerization", "kubernetes", "devops"],
      git: ["github", "version control", "gitlab"],
      "ui/ux": ["user interface", "user experience", "design", "figma"],
      responsive: ["mobile friendly", "adaptive", "mobile first"],
      api: ["rest", "graphql", "webservices", "endpoints"],
      agile: ["scrum", "kanban", "sprint", "methodology"],
      testing: ["unit testing", "integration testing", "qa", "jest"],
      mern: ["mongodb", "express", "react", "node", "full stack"],
      "full stack": ["fullstack", "full-stack", "frontend", "backend", "mern"],
      frontend: ["front-end", "front end", "ui", "client side", "react"],
      backend: ["back-end", "back end", "server side", "api", "node"],
      wordpress: ["wp", "cms", "php"],
      shopify: ["ecommerce", "online store", "dropshipping"],
      seo: ["search engine optimization", "marketing"],
      "social media": ["facebook", "instagram", "twitter", "marketing"],
    };

    const matchingSkills = projectSkills.filter((projectSkill) => {
      const cleanProjectSkill = projectSkill
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      return allUserSkills.some((userSkill) => {
        if (typeof userSkill !== "string") return false;
        const cleanUserSkill = userSkill.toLowerCase().replace(/[^a-z0-9]/g, "");

        // Direct match
        if (cleanProjectSkill === cleanUserSkill) return true;

        // Contains match
        if (
          cleanProjectSkill.includes(cleanUserSkill) ||
          cleanUserSkill.includes(cleanProjectSkill)
        )
          return true;

        // Synonym match
        const findSynonyms = (skill) => {
            const clean = skill.toLowerCase().replace(/[^a-z0-9]/g, "");
            for (const [key, syns] of Object.entries(skillSynonyms)) {
                if (key.replace(/[^a-z0-9]/g, "") === clean || syns.some(s => s.replace(/[^a-z0-9]/g, "") === clean)) {
                    return [key, ...syns].map(s => s.replace(/[^a-z0-9]/g, ""));
                }
            }
            return [clean];
        };

        const projectSyns = findSynonyms(projectSkill);
        const userSyns = findSynonyms(userSkill);

        return projectSyns.some(ps => userSyns.includes(ps));
      });
    });

    // Very generous skills scoring - minimum 75% if any skills match, 90% for AI
    if (matchingSkills.length > 0) {
      const matchRatio = matchingSkills.length / Math.max(projectSkills.length, 1);
      const baseScore = Math.max(
        75,
        matchRatio * 100
      );
      analysis.skillsMatch = isAIGenerated
        ? Math.min(98, baseScore + 10)
        : baseScore;
    } else {
      analysis.skillsMatch = isAIGenerated ? 65 : 10; // Give a small base score even for effort
    }
    totalScore += analysis.skillsMatch * 0.25;

    // 2. Experience Level (20% weight) - Very generous scoring
    const completedProjects = user.completedProjects || 0;
    if (completedProjects >= 20) analysis.experienceLevel = 100;
    else if (completedProjects >= 10) analysis.experienceLevel = 95;
    else if (completedProjects >= 5) analysis.experienceLevel = 90;
    else if (completedProjects >= 2) analysis.experienceLevel = 85;
    else if (completedProjects >= 1) analysis.experienceLevel = 80;
    else analysis.experienceLevel = isAIGenerated ? 70 : 50; // AI gets higher base score

    totalScore += analysis.experienceLevel * 0.2;

    // 3. Proposal Quality Analysis (30% weight) - Very generous scoring
    if (description && description.trim().length > 0) {
      const proposalLength = description.length;
      const wordCount = description.split(/\s+/).length;

      // Very generous length scoring
      let lengthScore = 0;
      if (proposalLength >= 500) lengthScore = 100;
      else if (proposalLength >= 300) lengthScore = 95;
      else if (proposalLength >= 200) lengthScore = 90;
      else if (proposalLength >= 100) lengthScore = 85;
      else if (proposalLength >= 50) lengthScore = 80;
      else lengthScore = isAIGenerated ? 75 : 60;

      // Enhanced content relevance analysis
      const projectKeywords = [
        project.title.toLowerCase(),
        project.category.toLowerCase(),
        ...projectSkills.map((s) => s.toLowerCase()),
        project.description.toLowerCase().split(/\s+/).slice(0, 50).join(" "),
        project.experience?.toLowerCase() || "",
        project.problems?.toLowerCase() || "",
        project.budget?.toString() || "",
        project.duration?.toLowerCase() || "",
      ];

      const proposalWords = description.toLowerCase().split(/\s+/);
      const relevantWords = proposalWords.filter((word) => {
        const cleanWord = word.replace(/[^a-z]/g, "");
        if (cleanWord.length < 3) return false; // Skip very short words

        return projectKeywords.some((keyword) => {
          const cleanKeyword = keyword.replace(/[^a-z]/g, "");
          return (
            cleanKeyword.includes(cleanWord) ||
            cleanWord.includes(cleanKeyword) ||
            cleanWord === cleanKeyword
          );
        });
      });

      // Very generous relevance scoring - minimum 80% if any relevant words, 90% for AI
      const relevanceScore =
        relevantWords.length > 0
          ? isAIGenerated
            ? Math.max(
                90,
                (relevantWords.length / Math.min(proposalWords.length, 50)) * 100
              )
            : Math.max(
                80,
                (relevantWords.length / Math.min(proposalWords.length, 50)) * 100
              )
          : isAIGenerated
          ? 75
          : 0;

      // Professional language analysis
      const professionalWords = [
        "experience",
        "expertise",
        "skills",
        "knowledge",
        "proficient",
        "expert",
        "develop",
        "create",
        "build",
        "implement",
        "design",
        "optimize",
        "improve",
        "solution",
        "project",
        "deliver",
        "complete",
        "quality",
        "professional",
        "reliable",
        "efficient",
        "effective",
        "successful",
        "proven",
        "track record",
        "work",
        "done",
        "completed",
        "finished",
        "delivered",
        "built",
        "created",
        "developed",
        "designed",
        "implemented",
        "solved",
        "problem",
        "challenge",
      ];

      const professionalWordCount = proposalWords.filter((word) =>
        professionalWords.includes(word.toLowerCase().replace(/[^a-z]/g, ""))
      ).length;

      const professionalismScore = Math.min(
        (professionalWordCount / Math.max(proposalWords.length, 1)) * 100,
        100
      );

      // Grammar and structure analysis (basic)
      const sentences = description
        .split(/[.!?]+/)
        .filter((s) => s.trim().length > 0);
      const avgSentenceLength =
        sentences.length > 0
          ? sentences.reduce(
              (sum, sentence) => sum + sentence.split(/\s+/).length,
              0
            ) / sentences.length
          : 0;

      let structureScore = 0;
      if (sentences.length >= 3 && avgSentenceLength >= 8) {
        structureScore = 100;
      } else if (sentences.length >= 2 && avgSentenceLength >= 5) {
        structureScore = 95;
      } else if (sentences.length >= 1 && avgSentenceLength >= 3) {
        structureScore = isAIGenerated ? 90 : 80;
      } else {
        structureScore = isAIGenerated ? 85 : 70;
      }

      // Content quality analysis
      const contentQualityScore = analyzeContentQuality(
        description,
        isAIGenerated
      );
      analysis.contentQuality = contentQualityScore;

      // Calculate final proposal quality score - very generous for AI
      analysis.proposalQuality =
        lengthScore * 0.2 +
        relevanceScore * 0.4 +
        professionalismScore * 0.2 +
        structureScore * 0.1 +
        contentQualityScore * 0.1;

      // Boost AI-generated content
      if (isAIGenerated) {
        analysis.proposalQuality = Math.min(95, analysis.proposalQuality + 10);
      }
    } else {
      analysis.proposalQuality = isAIGenerated ? 70 : 0;
    }

    totalScore += analysis.proposalQuality * 0.3;

    // 4. Portfolio Relevance (15% weight) - Very generous scoring
    const portfolio = user.portfolio || [];
    if (portfolio.length > 0) {
      let relevantPortfolioItems = 0;

      for (const item of portfolio) {
        let isRelevant = false;

        // Check if portfolio item has a link
        if (item.link) {
          const linkText = item.link.toLowerCase();
          const itemTitle = (item.title || "").toLowerCase();
          const itemDescription = (item.description || "").toLowerCase();

          // Check for relevant technologies in link, title, or description
          const allText = `${linkText} ${itemTitle} ${itemDescription}`;

          // Check if any project skills are mentioned
          for (const skill of projectSkills) {
            const cleanSkill = skill.toLowerCase().replace(/[^a-z]/g, "");
            if (allText.includes(cleanSkill)) {
              isRelevant = true;
              break;
            }
          }

          // Check for common project types
          const projectTypes = [
            "mern",
            "full stack",
            "ecommerce",
            "blog",
            "website",
            "app",
            "application",
            "dashboard",
            "cms",
          ];
          for (const type of projectTypes) {
            if (allText.includes(type)) {
              isRelevant = true;
              break;
            }
          }

          // Check for common platforms
          const platforms = [
            "github",
            "vercel",
            "netlify",
            "heroku",
            "aws",
            "firebase",
            "digitalocean",
          ];
          for (const platform of platforms) {
            if (linkText.includes(platform)) {
              isRelevant = true;
              break;
            }
          }
        }

        if (isRelevant) {
          relevantPortfolioItems++;
        }
      }

      // Very generous portfolio scoring - minimum 80% if any relevant items, 90% for AI
      if (relevantPortfolioItems > 0) {
        const baseScore = Math.max(
          80,
          (relevantPortfolioItems / portfolio.length) * 100
        );
        analysis.portfolioRelevance = isAIGenerated
          ? Math.min(95, baseScore + 10)
          : baseScore;
      } else {
        analysis.portfolioRelevance = isAIGenerated ? 60 : 40; // Base score for having portfolio
      }
    } else {
      analysis.portfolioRelevance = isAIGenerated ? 50 : 0;
    }

    totalScore += analysis.portfolioRelevance * 0.15;

    // 5. Bio Relevance (5% weight) - Very generous scoring
    const bio = user.bio || "";
    if (bio.length > 0) {
      const bioWords = bio.toLowerCase().split(/\s+/);
      const relevantBioWords = bioWords.filter((word) =>
        projectSkills.some(
          (skill) =>
            skill.toLowerCase().includes(word) ||
            word.includes(skill.toLowerCase())
        )
      );

      // Very generous bio scoring - minimum 70% if any relevant words, 80% for AI
      if (relevantBioWords.length > 0) {
        const baseScore = Math.max(
          70,
          (relevantBioWords.length / Math.max(bioWords.length, 1)) * 100
        );
        analysis.bioRelevance = isAIGenerated
          ? Math.min(90, baseScore + 10)
          : baseScore;
      } else {
        analysis.bioRelevance = isAIGenerated ? 60 : 40; // Base score for having bio
      }
    } else {
      analysis.bioRelevance = isAIGenerated ? 50 : 0;
    }

    totalScore += analysis.bioRelevance * 0.05;

    // 6. Rating (5% weight)
    analysis.rating = user.rating || 0;
    totalScore += analysis.rating * 0.05;

    // Calculate final percentage
    const finalPercentage = Math.round(totalScore);

    // Determine match level and emoji
    let matchLevel = "";
    let emoji = "";
    let animation = "";
    let message = "";

    if (finalPercentage >= 90) {
      matchLevel = "Legendary";
      emoji = "🏆";
      animation = "legendary";
      message = "Exceptional match! You're perfectly suited for this project!";
    } else if (finalPercentage >= 80) {
      matchLevel = "Excellent";
      emoji = "🎉";
      animation = "excellent";
      message = "Excellent match! High chance of getting hired!";
    } else if (finalPercentage >= 70) {
      matchLevel = "Good";
      emoji = "👍";
      animation = "good";
      message = "Good match! Your application looks promising!";
    } else if (finalPercentage >= 50) {
      matchLevel = "Fair";
      emoji = "🤔";
      animation = "fair";
      message = "Fair match. Consider improving your proposal!";
    } else {
      matchLevel = "Poor";
      emoji = "😔";
      animation = "poor";
      message = "Low match. Improve your skills and proposal!";
    }

    res.status(200).json({
      success: true,
      data: {
        percentage: finalPercentage,
        matchLevel,
        emoji,
        animation,
        message,
        analysis,
        matchingSkills,
        totalSkills: projectSkills.length,
        matchedSkills: matchingSkills.length,
        isAIGenerated: analysis.aiGenerated,
      },
    });
  } catch (error) {
    console.error("Match calculation error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate match percentage",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Function to check if content appears to be AI-generated
const checkIfAIGenerated = (text) => {
  if (!text || text.length < 50) return false;

  const aiIndicators = [
    "i am a skilled",
    "i have extensive experience",
    "i am proficient in",
    "i can help you",
    "i will ensure",
    "i guarantee",
    "i am confident",
    "i understand your requirements",
    "i am committed to",
    "i will deliver",
    "i have successfully completed",
    "i specialize in",
    "i am experienced in",
    "i can provide",
    "i will work closely",
    "i am dedicated to",
    "i have a proven track record",
    "i am well-versed in",
    "i can assure you",
    "i will maintain",
    "i am passionate about",
    "i have expertise in",
    "i will implement",
    "i can create",
    "i will develop",
    "i am capable of",
    "i will ensure that",
    "i can guarantee",
    "i am confident that",
    "i understand that",
    "i am committed to delivering",
    "i will work with you",
  ];

  const textLower = text.toLowerCase();
  const aiIndicatorCount = aiIndicators.filter((indicator) =>
    textLower.includes(indicator)
  ).length;

  // If more than 3 AI indicators are found, consider it AI-generated
  return aiIndicatorCount >= 3;
};

// Function to analyze content quality
const analyzeContentQuality = (text, isAIGenerated) => {
  if (!text) return 0;

  let score = 0;
  const words = text.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Length quality
  if (text.length >= 500) score += 25;
  else if (text.length >= 300) score += 20;
  else if (text.length >= 200) score += 15;
  else if (text.length >= 100) score += 10;
  else score += 5;

  // Sentence structure quality
  if (sentences.length >= 3) score += 20;
  else if (sentences.length >= 2) score += 15;
  else if (sentences.length >= 1) score += 10;

  // Word variety quality
  const uniqueWords = new Set(words.map((w) => w.toLowerCase()));
  const wordVariety = (uniqueWords.size / words.length) * 100;
  score += Math.min(20, wordVariety);

  // Professional tone quality
  const professionalWords = [
    "experience",
    "expertise",
    "skills",
    "knowledge",
    "proficient",
    "expert",
    "develop",
    "create",
    "build",
    "implement",
    "design",
    "optimize",
    "improve",
    "solution",
    "project",
    "deliver",
    "complete",
    "quality",
    "professional",
  ];

  const professionalWordCount = words.filter((word) =>
    professionalWords.includes(word.toLowerCase().replace(/[^a-z]/g, ""))
  ).length;

  score += Math.min(20, (professionalWordCount / words.length) * 100);

  // Grammar and punctuation quality (basic check)
  const hasProperPunctuation = /[.!?]/.test(text);
  const hasCapitalization = /[A-Z]/.test(text);

  if (hasProperPunctuation && hasCapitalization) score += 15;
  else if (hasProperPunctuation || hasCapitalization) score += 10;
  else score += 5;

  // Boost AI-generated content
  if (isAIGenerated) {
    score = Math.min(100, score + 15);
  }

  return Math.round(score);
};

// Get hire notifications for freelancer (recently hired projects)
export const getHireNotifications = async (req, res) => {
  try {
    // Authentication check
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userId = req.user.id;
    const cacheKey = `hire-notifications:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    // Get all hired applications for this user, sorted by most recent first
    const hiredApplications = await ProjectApplyModel.find({
      user: userId,
      status: "hired",
    })
      .populate({
        path: "project",
        select: "title description budget status category skillsRequired deadline client createdAt",
        populate: {
          path: "client",
          select: "username email profileImage",
        },
      })
      .sort({ updatedAt: -1 })
      .limit(20); // Limit to recent 20 notifications

    // Format the response data with full project details
    const notifications = hiredApplications.map((app) => ({
      applicationId: app._id,
      projectId: app.project?._id,
      projectTitle: app.project?.title,
      projectDescription: app.project?.description,
      projectBudget: app.project?.budget,
      projectStatus: app.project?.status,
      projectCategory: app.project?.category,
      projectSkills: app.project?.skillsRequired || [],
      projectDeadline: app.project?.deadline,
      client: app.project?.client,
      hiredDate: app.updatedAt,
      createdAt: app.project?.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Hire notifications fetched successfully",
      data: notifications,
    });
  } catch (error) {
    console.error("Error fetching hire notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hire notifications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// Cancel a hired project (Freelancer)
export const cancelHiredProject = async (req, res) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(applicationId)) {
        return res.status(400).json({ success: false, message: "Invalid application ID" });
    }

    const application = await ProjectApplyModel.findOne({ _id: applicationId, user: userId });

    if (!application) {
        return res.status(404).json({ success: false, message: "Application not found" });
    }

    // Allow cancelling if status is hired or in-progress
    if (application.status !== "hired" && application.status !== "in-progress") {
        return res.status(400).json({ success: false, message: "Only hired or in-progress projects can be cancelled via this method" });
    }

    const { cancellationReason, cancellationDetails } = req.body;
    
    // 1. Update Application status to cancelled
    application.status = "cancelled";
    application.cancellationReason = cancellationReason || "Freelancer cancelled";
    application.cancellationDetails = cancellationDetails || "";
    await application.save();

    // 2. Update Project status back to 'open'
    const project = await PostProjectModel.findById(application.project);
    if (project) {
        project.status = "open";
        await project.save();
    }

     // Invalidate cache
    const cacheKey = `hired-applications:${userId}`;
    await redisClient.del(cacheKey);

    // Also invalidate project cache if exists
    await redisClient.del('catch-all-project-detail');
    await redisClient.del('project-applicnat-count');


    res.status(200).json({ success: true, message: "Project cancelled successfully and is now open for other freelancers" });

  } catch (error) {
     res.status(500).json({ success: false, message: "Failed to cancel project", error: error.message });
  }
};
// Get cancelled projects for a user
export const getCancelledProjectsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find applications that were cancelled
    // These are projects where the freelancer was hired but then the project was cancelled
    const cancelledApplications = await ProjectApplyModel.find({
      user: userId,
      status: { $in: ["cancelled", "hired", "in-progress"] },
    })
      .select("status cancellationReason cancellationDetails updatedAt")
      .populate({
        path: "project",
        select: "title description budget status cancellationReason cancellationDetails",
        model: PostProjectModel,
      })
      .sort({ updatedAt: -1 });

    // Filter to only include actually cancelled ones (either app status or project status)
    const filteredCancelled = cancelledApplications.filter(app => 
      app.status === "cancelled" || (app.project && app.project.status === "cancelled")
    );

    res.status(200).json({
      success: true,
      data: filteredCancelled,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch cancelled projects",
      error: error.message,
    });
  }
};
