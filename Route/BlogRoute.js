import express from "express";
import {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog,
  uploadBlogImage,
} from "../Controller.js/BlogController.js";
import { generateAIBlog } from "../Controller.js/AIBlogController.js";
import { isAdmin, requireSignIn } from "./../middleware/UserMiddleware.js";
import uploadImage from "../middleware/uploadimage.js";
import { cacheMiddleware } from "../middleware/cacheMiddleware.js";

const router = express.Router();

// Public routes
router.get("/all", getAllBlogs);
router.get("/get/:id", cacheMiddleware(604800, 'blogdetail'), getBlogById);

// Admin only routes
router.post("/create", requireSignIn, isAdmin, createBlog);
router.put("/update/:id", requireSignIn, isAdmin, updateBlog);
router.delete("/delete/:id", requireSignIn, isAdmin, deleteBlog);
router.post(
  "/upload-image",
  requireSignIn,
  isAdmin,
  uploadImage.single("image"),
  uploadBlogImage
);

// AI Blog Generation Route
router.post("/generate-ai-blog", requireSignIn, isAdmin, generateAIBlog);

export default router;
