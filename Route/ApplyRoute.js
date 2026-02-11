// routes/projectApplyRoutes.js
import express from "express";
import { requireSignIn } from "../middleware/UserMiddleware.js";

import {
  applyToProject,
  checkHiredApplications,
  getApplicantsCountForProjects,
  getApplicantsDetailsByProject,
  getAppliedProjects,
  getProjectDetails,
  checkIfUserApplied,
  getApplicationsForClient,
  calculateMatchPercentage,
  deleteApplicantProposalAdmin,
  getHireNotifications,
  cancelHiredProject,
  getCancelledProjectsForUser,
} from "../Controller.js/ProjectApplyController.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Check if user has already applied to a project
router.get("/check-application/:projectId", requireSignIn, checkIfUserApplied);

router.post("/apply", requireSignIn, applyToProject);

router.get(
  "/applied-projects", 
  requireSignIn, 
  cacheMiddleware(30, 'applied-projects'),
  getAppliedProjects
);

// Check hired applications
router.get("/applications/hired", requireSignIn, checkHiredApplications);

// Get hire notifications for freelancer
router.get("/hire-notifications", requireSignIn, getHireNotifications);

// Get applicants count for all projects
router.get(
  "/projects/applicants-count",
  cacheMiddleware(60, () => 'project-applicant-count:global'),
  requireSignIn,
  getApplicantsCountForProjects
);

// Get applicants details for a specific project
router.get(
  "/applicants-details/:projectId",
  requireSignIn,
  cacheMiddleware(30, 'applicants-detail'),
  getApplicantsDetailsByProject
);

// Get all applications for client's projects
router.get(
  "/applications-for-client", 
  requireSignIn, 
  cacheMiddleware(30, 'client-applications'),
  getApplicationsForClient
);

// Calculate real-time match percentage
router.post("/calculate-match", requireSignIn, calculateMatchPercentage);

// ADMIN: Delete a specific applicant's proposal from a project
router.delete(
  "/admin/project/:projectId/applicant/:applicationId",
  requireSignIn,
  deleteApplicantProposalAdmin
);

// Cancel a hired project (Freelancer side)
router.post(
  "/cancel-project/:applicationId",
  requireSignIn,
  cancelHiredProject
);

router.get("/cancelled/:userId", getCancelledProjectsForUser);

// Keep the catch-all id route LAST to avoid shadowing more specific routes
router.get(
  "/:id", 
  requireSignIn, 
  cacheMiddleware(30, 'project-detail'),
  getProjectDetails
);

export default router;
