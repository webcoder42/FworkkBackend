import express from "express";
import { handleStudioChat } from "../Controller.js/StudioController.js";
import { requireSignIn } from "../middleware/UserMiddleware.js";

const router = express.Router();

// POST: /api/v1/studio/chat
router.post("/chat", requireSignIn, handleStudioChat);

export default router;
