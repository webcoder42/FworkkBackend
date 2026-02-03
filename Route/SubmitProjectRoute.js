import express from "express";
import { requireSignIn } from "./../middleware/UserMiddleware.js";
import {
  checkUserProjectSubmission,
  getSubmissionDetails,
  submitProject,
  updateSubmissionStatus,
  getProjectSubmissionForClient,
  getAllProjectSubmissionsForClient,
  checkUserApprovedSubmissions,
  checkUserInProgressSubmissions,
  getClientWorkSubmissions,
} from "../Controller.js/SubmitProjectController.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Submit project (NO CACHE)
router.post("/projects/:projectId", requireSignIn, submitProject);

// Get submission details (user + project specific)
router.get(
  "/projects/:projectId",
  requireSignIn,
  cacheMiddleware(req => `submission:${req.user.id}:${req.params.projectId}`, 20),
  getSubmissionDetails
);

// Check submission exists (project based)
router.get(
  "/project-submission/:projectId",
  requireSignIn,
  checkUserProjectSubmission
);

// Update submission (NO CACHE)
router.put("/project-update/:id", requireSignIn, updateSubmissionStatus);

// Client view single submission
router.get(
  "/client/submission/:projectId",
  requireSignIn,
  cacheMiddleware(req => `client-submission:${req.user.id}:${req.params.projectId}`, 20),
  getProjectSubmissionForClient
);

// Client: all submissions of a project
router.get(
  "/project/:projectId",
  requireSignIn,
  cacheMiddleware(req => `project-submissions:${req.user.id}:${req.params.projectId}`, 30),
  getAllProjectSubmissionsForClient
);

// User approved submissions
router.get(
  "/approved/:userId",
  cacheMiddleware(req => `approved:${req.params.userId}`, 20),
  checkUserApprovedSubmissions
);

// User in-progress submissions
router.get(
  "/inprogress/:userId",
  cacheMiddleware(req => `inprogress:${req.params.userId}`, 10),
  checkUserInProgressSubmissions
);

// Client notifications
router.get(
  "/client/all-submissions",
  requireSignIn,
  cacheMiddleware(req => `client-notifications:${req.user.id}`, 10),
  getClientWorkSubmissions
);

export default router;
