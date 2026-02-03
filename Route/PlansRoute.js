import express from "express";
import { isAdmin, requireSignIn } from "./../middleware/UserMiddleware.js";
import {
  createPlan,
  deletePlan,
  getAllPlans,
  getSinglePlan,
  getTeamPlans,
  updatePlan,
  autoGeneratePlans,
} from "../Controller.js/PlansController.js";

const router = express.Router();

// @route   POST /api/plans
router.post("/create-plan", requireSignIn, isAdmin, createPlan);

// @route   GET /api/plans
router.get("/get-plan", requireSignIn, getAllPlans);

// @route   GET /api/plans/:id
router.get("/get-plan/:id", requireSignIn, isAdmin, getSinglePlan);

// @route   PUT /api/plans/:id
router.put("/update-plan/:id", requireSignIn, isAdmin, updatePlan);

// @route   DELETE /api/plans/:id
router.delete("/delete-plan/:id", requireSignIn, isAdmin, deletePlan);
router.post("/auto-generate-plans", requireSignIn, isAdmin, autoGeneratePlans);

router.get("/plans-team", requireSignIn, getTeamPlans);

export default router;
