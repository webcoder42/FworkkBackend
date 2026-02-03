import express from "express";
import {
  getUserVIPStatus,
  getAllVIPUsers,
  getVIPStats,
  checkVIPStatus,
} from "../Controller.js/VIPController.js";

const router = express.Router();

router.get("/user/:userId", getUserVIPStatus);
router.get("/all", getAllVIPUsers);
router.get("/stats", getVIPStats);
router.post("/check/:userId", checkVIPStatus);

export default router;
