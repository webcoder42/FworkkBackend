import BlogModel from "../Model/BlogModel.js";
import uploadImage from "../middleware/uploadimage.js";
import sanitize from "mongo-sanitize";
import { uploadImageToCloudinary } from "../services/cloudinaryService.js";

// 🟢 Get All Blogs (Public)
export const getAllBlogs = async (req, res) => {
  console.log("🟢 DB HIT: getAllBlogs");
  try {
    const blogs = await BlogModel.find({}).sort({ createdAt: -1 });
      // 🔥 REDIS SAVE YAHAN HO GA
  if (res.locals.cacheKey) {
    console.log("💾 Saving to Redis:", res.locals.cacheKey)}
    res.status(200).json({
      success: true,
      count: blogs.length,
      blogs,
    });
  } catch (error) {
    console.error("Get blogs error:", error);
    res.status(500).json({ error: "Server error while fetching blogs." });
  }
};

// 🟢 Get Single Blog (Public)
export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the ID is a valid MongoDB ObjectId
    if (!id || id.length !== 24) {
      return res.status(400).json({ error: "Invalid blog ID format." });
    }

    const blog = await BlogModel.findById(id);

    if (!blog) {
      return res.status(404).json({ error: "Blog not found." });
    }

    res.status(200).json({
      success: true,
      blog,
    });
  } catch (error) {
    console.error("Get blog error:", error);
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid blog ID format." });
    }
    res.status(500).json({ error: "Server error while fetching blog." });
  }
};

// 🟢 Create Blog (Admin only) - Updated for Cloudinary image processing
export const createBlog = async (req, res) => {
  try {
    const {
      image, // Thumbnail image URL or base64
    } = req.body;
    const title = sanitize(req.body.title);
    const tags = Array.isArray(req.body.tags)
      ? req.body.tags.map((tag) => sanitize(tag))
      : [];
    const layoutType = sanitize(req.body.layoutType);
    const content = Array.isArray(req.body.content)
      ? req.body.content.map((block) => ({
          type: sanitize(block.type),
          value: sanitize(block.value),
        }))
      : [];

    // Debug log for content blocks
    console.log('CREATE BLOG content blocks:', JSON.stringify(req.body.content, null, 2));

    // ✅ Validation (Enhanced)
    if (!title || title.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "Title is required and cannot be empty." });
    }

    if (!content || !Array.isArray(content) || content.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one content block is required." });
    }

    // Validate each content block
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      if (!block.type || !block.value || block.value.trim().length === 0) {
        return res.status(400).json({
          error: `Content block ${
            i + 1
          } is invalid. Type and value are required.`,
        });
      }

      // Validate block type
      const validTypes = ["paragraph", "heading", "heading1", "heading2", "heading3", "image", "quote"];
      if (!validTypes.includes(block.type)) {
        return res.status(400).json({
          error: `Invalid content block type: ${
            block.type
          }. Valid types are: ${validTypes.join(", ")}`,
        });
      }
    }

    // ✅ Check if blog with same title already exists
    const existing = await BlogModel.findOne({ title: title.trim() });
    if (existing) {
      return res
        .status(400)
        .json({ error: "A blog with this title already exists." });
    }

    // Process thumbnail image if it's base64
    let processedImage = image || "";
    if (image && image.startsWith('data:image/')) {
      try {
        const cloudinaryResult = await uploadImageToCloudinary({
          base64: image,
          name: `blog-thumbnail-${Date.now()}`,
          size: image.length,
          type: image.split(';')[0].split(':')[1]
        }, 'blog-images');
        processedImage = cloudinaryResult.url;
      } catch (error) {
        console.error('Error uploading thumbnail to Cloudinary:', error);
        return res.status(500).json({ error: "Failed to upload thumbnail image to Cloudinary." });
      }
    }

    // Process content images (convert base64 to Cloudinary URLs)
    const processedContent = await Promise.all(
      content.map(async (block) => {
        if (block.type === 'image' && block.value.startsWith('data:image/')) {
          try {
            const cloudinaryResult = await uploadImageToCloudinary({
              base64: block.value,
              name: `blog-content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              size: block.value.length,
              type: block.value.split(';')[0].split(':')[1]
            }, 'blog-images');
            return {
              ...block,
              value: cloudinaryResult.url
            };
          } catch (error) {
            console.error('Error uploading content image to Cloudinary:', error);
            return block; // Keep original if upload fails
          }
        }
        return block;
      })
    );

    // ✅ Create New Blog
    const blog = new BlogModel({
      title: title.trim(),
      image: processedImage,
      tags: tags.filter((tag) => tag.trim().length > 0),
      layoutType: layoutType || "standard",
      content: processedContent.map((block) => ({
        type: block.type,
        value: block.value.trim(),
      })),
    });

    await blog.save();

    res.status(201).json({
      message: "Blog created successfully!",
      blog,
    });
  } catch (error) {
    console.error("Blog create error:", error);
    res.status(500).json({ error: "Server error while creating blog." });
  }
};

// 🟢 Update Blog (Admin only) - Updated for Cloudinary image processing
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    const image = req.body.image;
    const title = sanitize(req.body.title);
    const tags = Array.isArray(req.body.tags)
      ? req.body.tags.map((tag) => sanitize(tag))
      : [];
    const layoutType = sanitize(req.body.layoutType);
    const content = Array.isArray(req.body.content)
      ? req.body.content.map((block) => ({
          type: sanitize(block.type),
          value: sanitize(block.value),
        }))
      : [];

    // Debug log for content blocks
    console.log('UPDATE BLOG content blocks:', JSON.stringify(req.body.content, null, 2));

    // Find blog first
    const blog = await BlogModel.findById(id);
    if (!blog) {
      return res.status(404).json({ error: "Blog not found." });
    }

    // ✅ Validation (Enhanced)
    if (!title || title.trim().length === 0) {
      return res
        .status(400)
        .json({ error: "Title is required and cannot be empty." });
    }

    if (!content || !Array.isArray(content) || content.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one content block is required." });
    }

    // Validate each content block
    for (let i = 0; i < content.length; i++) {
      const block = content[i];
      if (!block.type || !block.value || block.value.trim().length === 0) {
        return res.status(400).json({
          error: `Content block ${
            i + 1
          } is invalid. Type and value are required.`,
        });
      }

      // Validate block type
      const validTypes = ["paragraph", "heading", "image", "quote"];
      if (!validTypes.includes(block.type)) {
        return res.status(400).json({
          error: `Invalid content block type: ${
            block.type
          }. Valid types are: ${validTypes.join(", ")}`,
        });
      }
    }

    // Check if title already exists (excluding current blog)
    const existing = await BlogModel.findOne({
      title: title.trim(),
      _id: { $ne: id },
    });
    if (existing) {
      return res
        .status(400)
        .json({ error: "A blog with this title already exists." });
    }

    // Process thumbnail image if it's base64
    let processedImage = image || "";
    if (image && image.startsWith('data:image/')) {
      try {
        const cloudinaryResult = await uploadImageToCloudinary({
          base64: image,
          name: `blog-thumbnail-${Date.now()}`,
          size: image.length,
          type: image.split(';')[0].split(':')[1]
        }, 'blog-images');
        processedImage = cloudinaryResult.url;
      } catch (error) {
        console.error('Error uploading thumbnail to Cloudinary:', error);
        return res.status(500).json({ error: "Failed to upload thumbnail image to Cloudinary." });
      }
    }

    // Process content images (convert base64 to Cloudinary URLs)
    const processedContent = await Promise.all(
      content.map(async (block) => {
        if (block.type === 'image' && block.value.startsWith('data:image/')) {
          try {
            const cloudinaryResult = await uploadImageToCloudinary({
              base64: block.value,
              name: `blog-content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              size: block.value.length,
              type: block.value.split(';')[0].split(':')[1]
            }, 'blog-images');
            return {
              ...block,
              value: cloudinaryResult.url
            };
          } catch (error) {
            console.error('Error uploading content image to Cloudinary:', error);
            return block; // Keep original if upload fails
          }
        }
        return block;
      })
    );

    // Update blog
    const updatedBlog = await BlogModel.findByIdAndUpdate(
      id,
      {
        title: title.trim(),
        image: processedImage,
        tags: tags.filter((tag) => tag.trim().length > 0),
        layoutType: layoutType || "standard",
        content: processedContent.map((block) => ({
          type: block.type,
          value: block.value.trim(),
        })),
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: "Blog updated successfully!",
      blog: updatedBlog,
    });
  } catch (error) {
    console.error("Blog update error:", error);
    res.status(500).json({ error: "Server error while updating blog." });
  }
};

// 🟢 Delete Blog (Admin only)
export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await BlogModel.findById(id);
    if (!blog) {
      return res.status(404).json({ error: "Blog not found." });
    }

    await BlogModel.findByIdAndDelete(id);

    res.status(200).json({
      message: "Blog deleted successfully!",
    });
  } catch (error) {
    console.error("Blog delete error:", error);
    res.status(500).json({ error: "Server error while deleting blog." });
  }
};

// 🟢 Upload Image (Admin only) - Updated for Cloudinary
export const uploadBlogImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided." });
    }

    // Check if buffer exists (should exist with memoryStorage)
    if (!req.file.buffer) {
      console.error("File buffer is missing:", req.file);
      return res.status(400).json({ error: "File upload failed. Please try again." });
    }

    // Upload to Cloudinary using streaming (buffer)
    const cloudinaryResult = await uploadImageToCloudinary({
      buffer: req.file.buffer,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    }, 'blog-images');

    res.status(200).json({
      success: true,
      message: "Image uploaded successfully to Cloudinary!",
      imageUrl: cloudinaryResult.url,
      public_id: cloudinaryResult.public_id
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: "Server error while uploading image to Cloudinary." });
  }
};
