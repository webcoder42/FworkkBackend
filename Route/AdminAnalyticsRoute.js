import express from "express";
import { requireSignIn, isAdmin } from "../middleware/UserMiddleware.js";
import {
  getAdminDashboardStats,
  getAllUserChats,
  getAllChatBotInteractions,
  getAllWorkSubmissions,
  getAllProjectRatings,
  getAllCompletedProjects,
  getAllHiredProjects,
  getAllWorkspaces,
  getActivityTimeline,
  getUserAnalytics,
  getSystemHealth,
  getExtendedAnalytics,
  getUserCallRecordings,
  getAllTransactions,
  getTransactionStats,
  verifyUserBalance,
} from "../Controller.js/AdminAnalyticsController.js";

const router = express.Router();

// Admin dashboard overview stats
router.get("/dashboard-stats", requireSignIn, isAdmin, getAdminDashboardStats);

// Extended analytics for funds and user activity
router.get("/extended-analytics", requireSignIn, isAdmin, getExtendedAnalytics);

// Get all user chats and messages
router.get("/user-chats", requireSignIn, isAdmin, getAllUserChats);

// Get all chatbot interactions
router.get("/chatbot-interactions", requireSignIn, isAdmin, getAllChatBotInteractions);

// Get all work submissions
router.get("/work-submissions", requireSignIn, isAdmin, getAllWorkSubmissions);

// Get all project ratings and reviews
router.get("/project-ratings", requireSignIn, isAdmin, getAllProjectRatings);

// Get all completed projects
router.get("/completed-projects", requireSignIn, isAdmin, getAllCompletedProjects);

// Get all hired projects
router.get("/hired-projects", requireSignIn, isAdmin, getAllHiredProjects);

// Get all workspaces
router.get("/workspaces", requireSignIn, isAdmin, getAllWorkspaces);

// Get activity timeline
router.get("/activity-timeline", requireSignIn, isAdmin, getActivityTimeline);

// Get specific user analytics
router.get("/user-analytics/:userId", requireSignIn, isAdmin, getUserAnalytics);

// Get system health metrics
router.get("/system-health", requireSignIn, isAdmin, getSystemHealth);

// Get user call recordings
router.get("/user-call-recordings", requireSignIn, isAdmin, getUserCallRecordings);

// ===== FINANCIAL TRANSACTION ROUTES =====
// Get all transactions (financial ledger)
router.get("/transactions", requireSignIn, isAdmin, getAllTransactions);

// Get transaction stats (revenue reports)
router.get("/transactions/stats", requireSignIn, isAdmin, getTransactionStats);

// Verify user balance against transaction history
router.get("/transactions/verify/:userId", requireSignIn, isAdmin, verifyUserBalance);

export default router;

