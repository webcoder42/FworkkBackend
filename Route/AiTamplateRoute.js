import express from "express";

import { createTemplate } from "../Controller.js/AiTamplateController.js";
import { requireSignIn } from "../middleware/UserMiddleware.js";

const router = express.Router();

// Protect this route so req.user is available (populated by requireSignIn)
router.post("/create", requireSignIn, createTemplate);

export default router;
