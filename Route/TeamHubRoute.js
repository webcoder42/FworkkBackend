import express from "express";
import { 
  createTeam, 
  getUserTeams, 
  updateTeam, 
  deleteTeam, 
  getTeamById,
  sendChatMessage,
  addUserToTeam,
  removeUserFromTeam,
  promoteUserToAdmin,
  demoteUserFromAdmin,
  getTeamTasks,
  createTeamTask,
  updateTeamTask,
  updateTeamSettings,
  leaveTeam,
  getTeamHubFreelancerNotifications,
  getTeamHubClientNotifications
} from "../Controller.js/TeamHubController.js";
import { requireSignIn } from "../middleware/UserMiddleware.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

import uploadImage from "../middleware/uploadimage.js";

router.post("/create", requireSignIn, uploadImage.single('logo'), createTeam);
router.get(
  "/my-teams",
  requireSignIn,
  cacheMiddleware("myworkspace", 10),
  getUserTeams
);

// Get team by ID (cache 60 sec)
router.get(
  "/team/:teamId",
  requireSignIn,
  cacheMiddleware((req) => `team:${req.params.teamId}`, 30),
  getTeamById
);

// Get team tasks (cache 60 sec)
router.get(
  "/team/:teamId/tasks",
  requireSignIn,
  cacheMiddleware((req) => `team-task:${req.params.teamId}`, 30),
  getTeamTasks
);router.put("/update/:teamId", requireSignIn, uploadImage.single('logo'), updateTeam);
router.delete("/delete/:teamId", requireSignIn, deleteTeam);

router.post("/team/:teamId/chat", requireSignIn, sendChatMessage);
router.post("/team/:teamId/add-user", requireSignIn, addUserToTeam);
router.delete("/team/:teamId/remove-user/:userId", requireSignIn, removeUserFromTeam);
router.put("/team/:teamId/promote-user/:userId", requireSignIn, promoteUserToAdmin);
router.put("/team/:teamId/demote-user/:userId", requireSignIn, demoteUserFromAdmin);

router.post("/team/:teamId/tasks", requireSignIn, createTeamTask);
router.put("/team/:teamId/tasks/:taskId", requireSignIn, updateTeamTask);
router.put("/team/:teamId/settings", requireSignIn, updateTeamSettings);
router.post("/team/:teamId/leave", requireSignIn, leaveTeam);

// Notifications for Bell
router.get("/notifications/freelancer", requireSignIn, getTeamHubFreelancerNotifications);
router.get("/notifications/client", requireSignIn, getTeamHubClientNotifications);

export default router;
