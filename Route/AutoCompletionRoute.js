import express from "express";
import { triggerAutoCompletion, getPendingSubmissions } from "../Controller.js/AutoCompletionController.js";

const router = express.Router();

router.post("/trigger", triggerAutoCompletion);
router.get("/pending", getPendingSubmissions);

export default router; 
