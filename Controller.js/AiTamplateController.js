import fs from "fs-extra";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

import { generateCodeFromAI } from "../utils/aiGenerator.js";
import AITamplateModel from "../Model/AITamplateModel.js";

const GENERATED_ROOT = path.join(process.cwd(), "generated_projects");

// 🧠 DeepSeek-powered Template Generator Controller
export const createTemplate = async (req, res) => {
  try {
    const { description, language } = req.body;
    const userId = req.user?._id || req.body.user || null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found or not logged in",
      });
    }

    // 1️⃣ Generate code using DeepSeek AI
    const structure = await generateCodeFromAI(description, language);

    // 2️⃣ Save generated template in database
    const newTemplate = await AITamplateModel.create({
      user: userId,
      description,
      language,
      structure,
    });

    // 3️⃣ Save files locally for live preview
    const projectDir = path.join(GENERATED_ROOT, newTemplate._id.toString());
    await fs.ensureDir(projectDir);

    for (const file of structure) {
      const safeFileName = file.fileName.replace(/^\/+/, "");
      const fullPath = path.join(projectDir, safeFileName);
      await fs.ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, file.content, "utf8");
    }

    // 4️⃣ Detect index.html for live preview link
    let previewRelative = null;
    const indexPaths = ["public/index.html", "index.html", "src/index.html"];

    for (const p of indexPaths) {
      const full = path.join(projectDir, p);
      if (await fs.pathExists(full)) {
        previewRelative = `/${newTemplate._id}/${p}`;
        break;
      }
    }

    // fallback if no index.html found
    if (!previewRelative && structure.length > 0) {
      previewRelative = `/${newTemplate._id}/${structure[0].fileName.replace(
        /^\/+/,
        ""
      )}`;
    }

    // 5️⃣ Generate final live preview URL
    const previewUrl = `${
      process.env.APP_URL || "http://localhost:5000"
    }/live${previewRelative}`;
    newTemplate.previewUrl = previewUrl;
    await newTemplate.save();

    // ✅ Send response
    return res.status(201).json({
      success: true,
      message: "Template generated successfully with DeepSeek AI!",
      data: newTemplate,
      previewUrl,
    });
  } catch (err) {
    console.error("❌ createTemplate error:", err);
    return res.status(500).json({
      success: false,
      message: `Server Error: ${err.message}`,
    });
  }
};
