import express from "express";
import { createCertificate, getCertificate, getAllCertificates, getUserStats } from "../Controller.js/CertificateController.js";
import { requireSignIn, isAdmin } from "../middleware/UserMiddleware.js";

const router = express.Router();

router.post("/create", requireSignIn, createCertificate);
router.get("/user-stats", requireSignIn, getUserStats);
router.get("/get-all", requireSignIn, isAdmin, getAllCertificates);
router.get("/:certificateId", getCertificate);

export default router;
