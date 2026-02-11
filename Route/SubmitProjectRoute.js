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
  cacheMiddleware(20, req => `submission:${req.user.id}:${req.params.projectId}`),
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
  cacheMiddleware(20, req => `client-submission:${req.user.id}:${req.params.projectId}`),
  getProjectSubmissionForClient
);

// Client: all submissions of a project
router.get(
  "/project/:projectId",
  requireSignIn,
  cacheMiddleware(30, req => `project-submissions:${req.user.id}:${req.params.projectId}`),
  getAllProjectSubmissionsForClient
);

// User approved submissions
router.get(
  "/approved/:userId",
  cacheMiddleware(20, req => `approved:${req.params.userId}`),
  checkUserApprovedSubmissions
);

// User in-progress submissions
router.get(
  "/inprogress/:userId",
  cacheMiddleware(10, req => `inprogress:${req.params.userId}`),
  checkUserInProgressSubmissions
);

// Client notifications
router.get(
  "/client/all-submissions",
  requireSignIn,
  cacheMiddleware(10, req => `client-notifications:${req.user.id}`),
  getClientWorkSubmissions
);

export default router;
