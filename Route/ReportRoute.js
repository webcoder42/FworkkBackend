import express from "express";
import {
  createReport,
  getAllReports,
  getReportById,
  getMyReports,
  updateReportStatus,
  deleteReport,
  getReportStats,
  getReportsAgainstUser,
  getReportCategories,
  testEmail,
} from "../Controller.js/ReportController.js";
import { requireSignIn, isAdmin } from "../middleware/UserMiddleware.js";

const router = express.Router();

// Public routes (require authentication)
router.post("/create", requireSignIn, createReport);
router.get("/my-reports", requireSignIn, getMyReports);
router.get("/categories", getReportCategories);
router.post("/test-email", requireSignIn, isAdmin, testEmail);

// Admin routes
router.get("/all", requireSignIn, isAdmin, getAllReports);
router.get("/stats", requireSignIn, isAdmin, getReportStats);
router.get("/user/:userId", requireSignIn, isAdmin, getReportsAgainstUser);
router.get("/:reportId", requireSignIn, isAdmin, getReportById);
router.put("/:reportId/status", requireSignIn, isAdmin, updateReportStatus);
router.delete("/:reportId", requireSignIn, isAdmin, deleteReport);

export default router;
