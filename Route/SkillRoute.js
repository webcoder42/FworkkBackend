import express from "express";
import { autocompleteSkills } from "../Controller.js/SkillController.js";

const router = express.Router();

// GET /api/v1/skills?q=<query>
router.get("/", autocompleteSkills);

export default router;
