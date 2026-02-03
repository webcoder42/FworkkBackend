import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Usually constants.js is inside config/ which is one level deep
const ROOT_DIR = path.join(__dirname, "..");

export const allowedOrigins = [
  "http://localhost:3000",
  "https://fworkk.vercel.app",
  "http://fworkk.vercel.app",
  "https://fworkk.netlify.app", // Keeping temporarily for transition
  process.env.FRONTEND_URL,
  process.env.API_FRONTENT_URL,
  process.env.API_FRONTENT_URL?.replace('http://', 'https://'),
].map(url => url?.trim()).filter(Boolean);

export const uniqueAllowedOrigins = [...new Set(allowedOrigins)];

export const setupDirectories = () => {
  const uploadsDir = path.join(ROOT_DIR, "uploads");
  const cvsDir = path.join(uploadsDir, "cvs");
  const projectImagesDir = path.join(uploadsDir, "project-images");
  const generatedRootDir = path.join(ROOT_DIR, "generated_projects");

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  if (!fs.existsSync(cvsDir)) fs.mkdirSync(cvsDir, { recursive: true });
  if (!fs.existsSync(projectImagesDir)) fs.mkdirSync(projectImagesDir, { recursive: true });
  if (!fs.existsSync(generatedRootDir)) fs.mkdirSync(generatedRootDir, { recursive: true });

  return {
    uploadsDir,
    generatedRootDir
  };
};
