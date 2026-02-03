// routes/helpCenterRoutes.js
import express from "express";
import { isAdmin, requireSignIn } from "./../middleware/UserMiddleware.js";
import {
  getAllComplaints,
  getUserComplaints,
  submitComplaint,
  updateComplaintStatus,
} from "../Controller.js/HelpCenterController.js";
import uploadImage from "../middleware/uploadimage.js";

const router = express.Router();

import chatUpload from "../middleware/chatUpload.js";

// @route POST /api/help-center/submit
router.post(
  "/submit",
  requireSignIn, // User must be logged in
  chatUpload.single("image"),
  submitComplaint
);
router.get("/complaints", requireSignIn, getUserComplaints);

router.get("/user-complaints", requireSignIn, isAdmin, getAllComplaints);

router.put(
  "/complaints/:complaintId",
  requireSignIn,
  isAdmin,
  updateComplaintStatus
);

export default router;
