import express from "express";
import { matchFreelancers } from "../Controller.js/FreelancerMatchController.js";
const router = express.Router();

router.post("/match", matchFreelancers);
export default router;
