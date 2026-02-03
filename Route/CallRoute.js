// backend/routes/callRoutes.js
import express from "express";

import {
  answerCall,
  endCall,
  getCallHistory,
  rejectCall,
  startCall,
  getToken,
} from "../Controller.js/CallController.js";
import { generateTokenMiddleware } from "../services/streamToken.js";

const router = express.Router();

// Start a call
router.post("/start", generateTokenMiddleware, startCall);

// Provide a token for a user (callee) without creating a call
router.post("/token", generateTokenMiddleware, getToken);

// Answer/Accept a call
router.post("/answer/:callId", answerCall);
router.post("/accept/:callId", answerCall);

// End a call
router.post("/end", endCall);

// Reject a call
router.post("/reject", rejectCall);
router.post("/reject/:callId", rejectCall);

// Get call history
router.get("/history/:userId", getCallHistory);

export default router;
