import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fs from "fs";
import archiver from "archiver";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "../uploads");
const cvDir = path.join(uploadDir, "cvs");

// Ensure directories exist
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(cvDir)) {
  fs.mkdirSync(cvDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'cvFile') {
      // Double-check CV directory exists
      if (!fs.existsSync(cvDir)) {
        fs.mkdirSync(cvDir, { recursive: true });
      }
      cb(null, cvDir);
    } else {
      // Create a unique folder for each submission
      const submissionDir = path.join(uploadDir, `submission_${Date.now()}`);
      if (!fs.existsSync(submissionDir)) {
        fs.mkdirSync(submissionDir, { recursive: true });
      }
      req.uploadDir = submissionDir; // Store for later use
      cb(null, submissionDir);
    }
  },
  filename: (req, file, cb) => {
    if (file.fieldname === 'cvFile') {
      // For CV files, use a simpler naming convention with original extension
      const ext = path.extname(file.originalname);
      const fileName = `CV_${Date.now()}${ext}`;
      cb(null, fileName);
    } else {
      // For other files, preserve folder structure from webkitRelativePath
      let filePath = file.originalname;

      if (file.originalname.includes("\\")) {
        // Handle Windows paths
        filePath = file.originalname.split("\\").join("/");
      }

      // Create necessary subdirectories
      const fullPath = path.join(req.uploadDir, filePath);
      const dirname = path.dirname(fullPath);

      if (!fs.existsSync(dirname)) {
        fs.mkdirSync(dirname, { recursive: true });
      }

      cb(null, filePath);
    }
  },
});

// Allow all file types
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'cvFile') {
    // Only allow PDF, DOC, and DOCX for CV files
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed for CV'));
    }
  } else {
    cb(null, true);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB per file
    files: 1000, // Increased limit for folder uploads
  },
});

// Enhanced zip function
export const zipFolder = (sourceDir, zipFilePath) => {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipFilePath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => resolve(zipFilePath));
    archive.on("error", (err) => reject(err));

    archive.pipe(output);

    // Add directory with original structure
    archive.directory(sourceDir, false);

    archive.finalize();
  });
};

export default upload;
