import express from "express";
import {
  startAIQuiz,
  getUserQuizResults,
  getQuizResultsByUserId,
  submitQuiz,
} from "../Controller.js/QuizController.js";
import { requireSignIn } from "./../middleware/UserMiddleware.js";

const router = express.Router();

// ✅ Route: Start AI-powered quiz (Generate + Save in DB)
router.post("/start", requireSignIn, startAIQuiz);

router.post("/submit", requireSignIn, submitQuiz);

// ✅ Route: Get all quiz results for logged-in user
router.get("/results", requireSignIn, getUserQuizResults);

// ✅ Route: Get quiz results for any user (public)
router.get("/results/:userId", getQuizResultsByUserId);

export default router;
