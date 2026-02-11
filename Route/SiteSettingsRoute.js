import express from "express";
import {
  getSiteSettings,
  updateSiteSettings,
  addSiteSettings,
} from "../Controller.js/SiteSettingsController.js";
import uploadImage from "../middleware/uploadimage.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// GET site settings
router.get("/", cacheMiddleware(86400, "siteSettings"), getSiteSettings);

router.put(
  "/",
  uploadImage.fields([
    { name: "siteLogo", maxCount: 1 },
    { name: "contentImage", maxCount: 1 },
  ]),
  updateSiteSettings
);

// ADD site settings (admin only, with file uploads)
router.post(
  "/",
  uploadImage.fields([
    { name: "siteLogo", maxCount: 1 },
    { name: "contentImage", maxCount: 1 },
  ]),
  addSiteSettings
);

export default router;
