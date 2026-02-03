import express from "express";
import { requireSignIn } from "../middleware/UserMiddleware.js";
import { sendProjectMessage } from "../Controller.js/ProjectMessageController.js";

const router = express.Router();

// Send message to project creator
router.post("/send/:projectId", requireSignIn, sendProjectMessage);

export default router; 
