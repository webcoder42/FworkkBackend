import express from "express";
import { requireSignIn } from "./../middleware/UserMiddleware.js";
import { createProjectLimiter } from "../middleware/rateLimiter.js";
import {
  createJobPost,
  deleteJobPost,
  getAllJobPosts,
  getApplicantDetails,
  getApplicantsForMyProjects,
  getApplicantsForProject,
  getJobPostById,
  getLatestJobPosts,
  getMyJobPosts,
  getProjectDetailsWithVerification,
  searchJobPosts,
  updateApplicationStatus,
  updateJobPost,
  getAllProjectsWithApplicantsAdmin,
  deleteProjectAndApplicantsAdmin,
  getRecommendedApplicants,
  hireFromTalentFinder,
  cancelJobPost,
  submitDailyWorkUpdate,
  getDailyWorkUpdates,
} from "../Controller.js/PostProjectController.js";
import { runAIProjectModeration } from "../Controller.js/AIModerationController.js";
import { getProjectsByClient } from "../Controller.js/ClientProjectsController.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";
import uploadImage from "../middleware/uploadimage.js";

const router = express.Router();

// Daily Work Update routes
router.post(
  "/daily-update/:projectId",
  requireSignIn,
  uploadImage.array("images", 5), // Allow up to 5 images
  submitDailyWorkUpdate
);

router.get("/daily-updates/:projectId", requireSignIn, getDailyWorkUpdates);

// Create a new job post (protected route)
router.post("/create", requireSignIn, createProjectLimiter, createJobPost);

// Get all job posts (public route)
router.get("/all",cacheMiddleware('get-all-jobs' , 10),  getAllJobPosts);

// Get job posts by logged-in user (protected route)
router.get("/my-jobs", requireSignIn, getMyJobPosts);

// Get latest job posts (public route)
router.get("/latest-jobs",cacheMiddleware('latest-job' , 10), getLatestJobPosts);

// Get single job post by ID (public route)
router.get("/:id", getJobPostById);

// Update job post (protected route - owner only)
router.put("/update/:id", requireSignIn, createProjectLimiter, updateJobPost);

// Delete job post (protected route - owner only)
router.delete("/delete/:id", requireSignIn, createProjectLimiter, deleteJobPost);

// Cancel job post (protected route - owner only)
router.put("/cancel/:id", requireSignIn, cancelJobPost);

router.get(
  "/project-detail/:id",
  requireSignIn,
  getProjectDetailsWithVerification
);

// Search job posts with filters (public route)
router.get("/search/all",cacheMiddleware('search-job', 10), searchJobPosts);

router.get("/my-project-applicants", requireSignIn, getApplicantsForMyProjects);

// Get applicants for a specific project (new route)
router.get("/applicants/:projectId", requireSignIn, getApplicantsForProject);

// Get recommended applicants for a specific project
router.get("/recommended-applicants/:projectId", requireSignIn, getRecommendedApplicants);

router.put(
  "/update-application/:applicationId",
  requireSignIn,
  updateApplicationStatus
);

router.get("/applicant/:id", requireSignIn, getApplicantDetails);

router.get("/client-projects/:clientId", getProjectsByClient);

// ADMIN: Get all projects with applicants
router.get("/admin/all-projects",cacheMiddleware('get-all-job' , 60), getAllProjectsWithApplicantsAdmin);

// ADMIN: Delete a project and all its applicants
router.delete("/admin/project/:id", deleteProjectAndApplicantsAdmin);

// NEW: Hire freelancer from Talent Finder
router.post("/hire-from-finder", requireSignIn, hireFromTalentFinder);

// AI Moderation: Scan all projects for contact details (Admin only ideally, but keeping it open for now or requireSignIn)
router.post("/admin/ai-moderation-scan", requireSignIn, runAIProjectModeration);

export default router;
