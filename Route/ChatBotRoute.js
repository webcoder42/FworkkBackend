import express from "express";
import {
  handleUserChat,
  generateProposal,
  getDailyProposalCount,
  voiceChatController,
  upload,
} from "../Controller.js/ChatBotController.js";
import { requireSignIn } from "../middleware/UserMiddleware.js";

const router = express.Router();

// POST: /api/v1/chat
router.post("/chat-bot", requireSignIn, handleUserChat);

// POST: /api/v1/chat/generate-proposal
router.post("/generate-proposal", requireSignIn, generateProposal);

// GET: /api/v1/chat/daily-proposal-count
router.get("/daily-proposal-count", requireSignIn, getDailyProposalCount);

router.post("/voice", upload.single("voice"), voiceChatController);

export default router;
