import express from "express";
import { requireSignIn } from "../middleware/UserMiddleware.js";
import { updateUserActivity } from "../services/ActivityTrackingService.js";

const router = express.Router();

// Update user activity (called when user is active)
router.post("/activity", requireSignIn, async (req, res) => {
  try {
    await updateUserActivity(req.user.id);
    res.status(200).json({
      success: true,
      message: "Activity updated"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update activity"
    });
  }
});

export default router; 
