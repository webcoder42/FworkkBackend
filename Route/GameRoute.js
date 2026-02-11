
import express from "express";
import { getGameWords } from "../Controller/GameController.js";
// import { protect } from "../middleware/authMiddleware.js"; // Optional: Add protection if needed

const router = express.Router();

router.get("/words", getGameWords);

export default router;
