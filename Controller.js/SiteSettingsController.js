import SiteSettings from "../Model/SiteSettingsModel.js";
import { redisClient } from "../server.js";
import {
  uploadImageToCloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
} from "../services/cloudinaryService.js";

// Get current site settings
export const getSiteSettings = async (req, res) => {
  try {
    const cacheKey = "siteSettings";

    // Check Redis cache
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    let settings = await SiteSettings.findOne();
    if (!settings) {
      // Create default if not exists
      settings = await SiteSettings.create({});
    }

    // Save to Redis for 1 day (86400 seconds)
    await redisClient.set(cacheKey, JSON.stringify(settings), { EX: 86400 });
    console.log("💾 Saved siteSettings to Redis for 1 day");

    res.status(200).json(settings);
  } catch (err) {
    console.error("Get site settings error:", err);
    res.status(500).json({ error: "Failed to fetch site settings", details: err.message });
  }
};


// Add site settings (only if none exist)
export const addSiteSettings = async (req, res) => {
  try {
    const existing = await SiteSettings.findOne();
    if (existing) {
      return res
        .status(400)
        .json({ error: "Settings already exist. Use update instead." });
    }
    let data = req.body;

    // Handle logo upload (memory buffer -> Cloudinary)
    if (req.files && req.files.siteLogo && req.files.siteLogo[0]) {
      try {
        const file = req.files.siteLogo[0];
        let result;
        if (file.buffer) {
          result = await uploadImageToCloudinary(
            {
              buffer: file.buffer,
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            },
            "site-settings"
          );
        } else if (file.path) {
          // fallback for host/path-based uploads
          result = await uploadToCloudinary(file.path, "site-settings");
        }
        const url = result && (result.secure_url || result.url);
        if (url) data.siteLogo = url;
      } catch (uploadError) {
        return res.status(500).json({
          error: "Failed to upload logo",
          details: uploadError.message,
        });
      }
    }

    // Handle content image upload (memory buffer -> Cloudinary)
    if (req.files && req.files.contentImage && req.files.contentImage[0]) {
      try {
        const file = req.files.contentImage[0];
        let result;
        if (file.buffer) {
          result = await uploadImageToCloudinary(
            {
              buffer: file.buffer,
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            },
            "site-content"
          );
        } else if (file.path) {
          result = await uploadToCloudinary(file.path, "site-content");
        }
        const url = result && (result.secure_url || result.url);
        if (url) data.contentImage = url;
      } catch (uploadError) {
        return res.status(500).json({
          error: "Failed to upload content image",
          details: uploadError.message,
        });
      }
    }

    const settings = await SiteSettings.create(data);
    
    // Invalidate Cache
    await redisClient.del("siteSettings");
    
    res.status(201).json(settings);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to add site settings", details: err.message });
  }
};

// Update site settings (admin only, only if exists)
export const updateSiteSettings = async (req, res) => {
  try {
    let settings = await SiteSettings.findOne();
    if (!settings) {
      return res
        .status(404)
        .json({ error: "No settings found. Please add settings first." });
    }

    const {
      siteTitle,
      siteDescription,
      cashoutTax,
      postProjectTax,
      addFundTax,
      taskCompletionTax,
      badge, // badge is expected to be an object with title, description, image, amount, tax, isActive
    } = req.body;

    // Update basic settings
    if (siteTitle !== undefined) settings.siteTitle = siteTitle;
    if (siteDescription !== undefined)
      settings.siteDescription = siteDescription;
    if (cashoutTax !== undefined) settings.cashoutTax = cashoutTax;
    if (postProjectTax !== undefined) settings.postProjectTax = postProjectTax;
    if (addFundTax !== undefined) settings.addFundTax = addFundTax;
    if (taskCompletionTax !== undefined)
      settings.taskCompletionTax = taskCompletionTax;

    // Add new badge/content to contents array
    if (badge && typeof badge === "object") {
      settings.contents.push({
        title: badge.title || "",
        description: badge.description || "",
        image: badge.image || "",
        amount: badge.amount || 0,
        tax: badge.tax || 0,
        isActive: badge.isActive !== undefined ? badge.isActive : true,
        createdAt: new Date(),
      });
    }

    // Handle logo upload (memory buffer -> Cloudinary)
    if (req.files && req.files.siteLogo && req.files.siteLogo[0]) {
      try {
        // Delete old logo from Cloudinary if exists
        if (settings.siteLogo && settings.siteLogo.includes("cloudinary")) {
          await deleteFromCloudinary(settings.siteLogo);
        }
        const file = req.files.siteLogo[0];
        let result;
        if (file.buffer) {
          result = await uploadImageToCloudinary(
            {
              buffer: file.buffer,
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            },
            "site-settings"
          );
        } else if (file.path) {
          result = await uploadToCloudinary(file.path, "site-settings");
        }
        const url = result && (result.secure_url || result.url);
        if (url) settings.siteLogo = url;
      } catch (uploadError) {
        return res.status(500).json({
          error: "Failed to upload logo",
          details: uploadError.message,
        });
      }
    }

    // Handle content image upload (memory buffer -> Cloudinary)
    if (req.files && req.files.contentImage && req.files.contentImage[0]) {
      try {
        // Delete old content image from Cloudinary if exists
        if (
          settings.contentImage &&
          settings.contentImage.includes("cloudinary")
        ) {
          await deleteFromCloudinary(settings.contentImage);
        }
        const file = req.files.contentImage[0];
        let result;
        if (file.buffer) {
          result = await uploadImageToCloudinary(
            {
              buffer: file.buffer,
              originalname: file.originalname,
              size: file.size,
              mimetype: file.mimetype,
            },
            "site-content"
          );
        } else if (file.path) {
          result = await uploadToCloudinary(file.path, "site-content");
        }
        const url = result && (result.secure_url || result.url);
        if (url) settings.contentImage = url;
      } catch (uploadError) {
        return res.status(500).json({
          error: "Failed to upload content image",
          details: uploadError.message,
        });
      }
    }

    // Add all other fields dynamically
    Object.keys(req.body).forEach((key) => {
      if (
        ![
          "siteTitle",
          "siteDescription",
          "cashoutTax",
          "postProjectTax",
          "addFundTax",
          "contentTitle",
          "contentDescription",
          "contentAmount",
          "contentIsActive",
          "taxFees",
        ].includes(key)
      ) {
        settings[key] = req.body[key];
      }
    });

    settings.updatedAt = new Date();
    await settings.save();

    // Invalidate Cache
    await redisClient.del("siteSettings");

    res.json(settings);
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to update site settings", details: err.message });
  }
};
