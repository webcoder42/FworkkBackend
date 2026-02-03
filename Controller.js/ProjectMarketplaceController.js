import mongoose from 'mongoose';
import ProjectMarketplace from '../Model/ProjectMarketplaceModel.js';
import ProjectPurchase from '../Model/ProjectPurchaseModel.js';
import User from '../Model/UserModel.js';
import { uploadMultipleImages, deleteImageFromCloudinary } from '../services/cloudinaryService.js';
import { ioGlobal } from './MessageController.js';
import dotenv from 'dotenv';
import { redisClient } from '../server.js';

dotenv.config();
const generateUniqueSlug = async (title) => {
  let slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim('-');
  
  let counter = 1;
  let originalSlug = slug;
  
  // Check if slug already exists and make it unique
  while (await ProjectMarketplace.findOne({ slug })) {
    slug = `${originalSlug}-${counter}`;
    counter++;
  }
  
  return slug;
};

const processMedia = async (mediaData) => {
  try {
    const isVideo = mediaData.type?.startsWith('video/') || mediaData.mimetype?.startsWith('video/');
    
    // Upload to Cloudinary using streaming (buffer) or base64
    const cloudinaryResult = await uploadMultipleImages([mediaData], 'project-images');
    
    const result = cloudinaryResult[0];
    if (result && result.url) {
      return {
        url: result.url,
        public_id: result.public_id,
        filename: result.filename || mediaData.originalname || mediaData.name,
        size: result.size || mediaData.size,
        mimetype: result.mimetype || mediaData.type || mediaData.mimetype,
        uploadedAt: result.uploadedAt || new Date()
      };
    } else {
      throw new Error('Cloudinary upload failed - no URL returned');
    }
  } catch (error) {
    console.error('Error processing media with Cloudinary:', error);
    throw new Error(`Failed to upload media to Cloudinary: ${error.message}`);
  }
};

export const createProject = async (req, res) => {
  try {
    // Parse stringified fields if using FormData (detected via req.files)
    if (req.files) {
      ['features', 'tags', 'links'].forEach(field => {
        if (typeof req.body[field] === 'string') {
          try {
            req.body[field] = JSON.parse(req.body[field]);
          } catch (e) {
            // Keep as string if it's not valid JSON (e.g. comma separated tags)
            if (field === 'links') console.error(`Error parsing ${field}:`, e);
          }
        }
      });
    }

    let {
      title,
      description,
      category,
      subCategory,
      price,
      duration,
      features,
      requirements,
      status,
      links,
      tags
    } = req.body;

    // Sanitize and validate description
    if (typeof description !== 'string') {
      if (description && typeof description === 'object' && description.description) {
        description = description.description;
      } else {
        description = String(description || '');
      }
    }

    description = description.trim();

    if (!title || !description || !category || price === undefined || price === null) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, category, and price are required'
      });
    }

    const numericPrice = parseFloat(price);
    if (isNaN(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Price must be a valid number greater than 0'
      });
    }

    const images = [];
    // Handle files from Multer
    if (req.files && req.files.images) {
      for (const file of req.files.images) {
        try {
          const processedImage = await processMedia(file);
          images.push(processedImage);
        } catch (error) {
          console.error('Error processing image file:', error);
        }
      }
    }
    // Handle legacy base64
    if (req.body.images && Array.isArray(req.body.images)) {
      for (const imageData of req.body.images) {
        if (imageData.base64 && imageData.name) {
          try {
            const processedImage = await processMedia(imageData);
            images.push(processedImage);
          } catch (error) {
            console.error('Error processing base64 image:', error);
          }
        }
      }
    }

    const videos = [];
    // Handle files from Multer
    if (req.files && req.files.videos) {
      for (const file of req.files.videos) {
        try {
          const processedVideo = await processMedia(file);
          videos.push(processedVideo);
        } catch (error) {
          console.error('Error processing video file:', error);
        }
      }
    }
    // Handle legacy base64
    if (req.body.videos && Array.isArray(req.body.videos)) {
      for (const videoData of req.body.videos) {
        if (videoData.base64 && videoData.name) {
          try {
            const processedVideo = await processMedia(videoData);
            videos.push(processedVideo);
          } catch (error) {
            console.error('Error processing base64 video:', error);
          }
        }
      }
    }

    const parsedFeatures = Array.isArray(features) ? features : 
      (typeof features === 'string' ? features.split(',').map(f => f.trim()) : []);
    
    const parsedTags = Array.isArray(tags) ? tags : 
      (typeof tags === 'string' ? tags.split(',').map(t => t.trim().toLowerCase()) : []);

    const parsedLinks = typeof links === 'string' ? JSON.parse(links) : links || {};

    const slug = await generateUniqueSlug(title);

    const project = new ProjectMarketplace({
      title,
      description,
      category,
      subCategory,
      price: numericPrice,
      duration,
      features: parsedFeatures,
      requirements,
      status: status || 'draft',
      links: parsedLinks,
      tags: parsedTags,
      images,
      videos,
      slug,
      seller: req.user._id || req.user.id
    });

    const savedProject = await project.save();
    await savedProject.populate('seller', 'username email profilePicture');

    // cache.clear(); // Fixed ReferenceError: cache is not defined

    res.status(201).json({
      success: true,
      message: 'Project created successfully',
      project: savedProject
    });

  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating project',
      error: error.message
    });
  }
};

export const getAllProjects = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      minPrice,
      maxPrice,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status = 'published'
    } = req.query;

    const userId = req.user?._id || req.user?.id;
    // Dynamic cache key including all query params and auth status
    const cacheKey = `projects-list:${JSON.stringify(req.query)}:${userId || 'guest'}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      return res.status(200).json(JSON.parse(cached));
    }
    console.log("🐢 Redis MISS:", cacheKey);

    const filter = { status, isActive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = parseFloat(minPrice);
      if (maxPrice) filter.price.$lte = parseFloat(maxPrice);
    }
    
    if (search && search.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: { $in: [searchRegex] } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [projects, total] = await Promise.all([
      ProjectMarketplace.find(filter)
        .populate('seller', 'username profilePicture rating')
        .sort(sort)
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      ProjectMarketplace.countDocuments(filter)
    ]);

    const projectsWithStats = projects.map(project => ({
      ...project,
      isLiked: userId ? project.userLikes?.some(id => id.toString() === userId.toString()) : false,
      isSaved: userId ? project.userSaves?.some(id => id.toString() === userId.toString()) : false
    }));

    const response = {
      success: true,
      projects: projectsWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProjects: total,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
      }
    };

    // Cache for 5 minutes
    await redisClient.setEx(cacheKey, 300, JSON.stringify(response));

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching projects',
      error: error.message
    });
  }
};

export const getProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;
    
    // We cache the base project data, but check status for each request or use per-user cache if stats are included
    const cacheKey = `project:${id}`;
    const cached = await redisClient.get(cacheKey);
    
    let projectData;
    if (cached) {
      console.log("⚡ Redis HIT:", cacheKey);
      projectData = JSON.parse(cached);
    } else {
      console.log("🐢 Redis MISS:", cacheKey);
      let project = await ProjectMarketplace.findById(id)
        .populate('seller', 'username email profilePicture rating')
        .populate('inquiries.user', 'username profilePicture')
        .lean();

      if (!project) {
        project = await ProjectMarketplace.findOne({ slug: id })
          .populate('seller', 'username email profilePicture rating')
          .populate('inquiries.user', 'username profilePicture')
          .lean();
      }

      if (!project) {
        return res.status(404).json({
          success: false,
          message: 'Project not found'
        });
      }
      projectData = project;
      await redisClient.setEx(cacheKey, 300, JSON.stringify(projectData));
    }

    if (userId) {
      // Increment view in DB
      const updatedProject = await ProjectMarketplace.findByIdAndUpdate(
        projectData._id, 
        { $inc: { viewCount: 1 } },
        { new: true }
      );
      if (updatedProject) projectData.viewCount = updatedProject.viewCount;
      
      // Emit real-time update
      if (ioGlobal) {
        ioGlobal.emit('projectViewUpdated', {
          projectId: projectData._id,
          viewCount: projectData.viewCount
        });
      }
    }

    res.status(200).json({
      success: true,
      project: {
        ...projectData,
        isLiked: userId ? projectData.userLikes?.some(id => id.toString() === userId.toString()) : false,
        isSaved: userId ? projectData.userSaves?.some(id => id.toString() === userId.toString()) : false
      }
    });

  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project',
      error: error.message
    });
  }
};

export const getUserProjects = async (req, res) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const filter = { seller: req.user._id || req.user.id };
    if (status && status !== 'all') {
      filter.status = status;
    }

    const [projects, total] = await Promise.all([
      ProjectMarketplace.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      ProjectMarketplace.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      projects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProjects: total
      }
    });

  } catch (error) {
    console.error('Error fetching user projects:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user projects',
      error: error.message
    });
  }
};

export const getProjectForEdit = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    const project = await ProjectMarketplace.findOne({ 
      _id: id, 
      seller: userId 
    }).populate('seller', 'username email profilePicture');

    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found or you are not authorized to edit this project'
      });
    }

    res.status(200).json({
      success: true,
      project
    });

  } catch (error) {
    console.error('Error fetching project for edit:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project',
      error: error.message
    });
  }
};

export const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Parse stringified fields if using FormData (detected via req.files)
    if (req.files) {
      ['features', 'tags', 'links'].forEach(field => {
        if (typeof req.body[field] === 'string') {
          try {
            req.body[field] = JSON.parse(req.body[field]);
          } catch (e) {
            if (field === 'links') console.error(`Error parsing ${field}:`, e);
          }
        }
      });
    }

    const updateData = req.body || {};

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.seller.toString() !== (req.user._id || req.user.id).toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to update this project'
      });
    }

    if (updateData.features) {
      updateData.features = Array.isArray(updateData.features) ? updateData.features : 
        (typeof updateData.features === 'string' ? updateData.features.split(',').map(f => f.trim()) : []);
    }
    
    if (updateData.tags) {
      updateData.tags = Array.isArray(updateData.tags) ? updateData.tags : 
        (typeof updateData.tags === 'string' ? updateData.tags.split(',').map(t => t.trim().toLowerCase()) : []);
    }

    if (updateData.links && typeof updateData.links === 'string') {
      try {
        updateData.links = JSON.parse(updateData.links);
      } catch (e) { console.error("Error parsing links:", e); }
    }

    if (updateData.title && updateData.title !== project.title) {
      updateData.slug = await generateUniqueSlug(updateData.title);
    }

    const newImages = [];
    if (req.files && req.files.images) {
      for (const file of req.files.images) {
        try {
          const processedImage = await processMedia(file);
          newImages.push(processedImage);
        } catch (error) {
          console.error('Error processing image file:', error);
        }
      }
    }
    if (req.body.images && Array.isArray(req.body.images)) {
      for (const imageData of req.body.images) {
        if (imageData.base64 && imageData.name) {
          try {
            const processedImage = await processMedia(imageData);
            newImages.push(processedImage);
          } catch (error) {
            console.error('Error processing base64 image:', error);
          }
        }
      }
    }
    if (newImages.length > 0) {
      updateData.images = [...(project.images || []), ...newImages];
    }

    const newVideos = [];
    if (req.files && req.files.videos) {
      for (const file of req.files.videos) {
        try {
          const processedVideo = await processMedia(file);
          newVideos.push(processedVideo);
        } catch (error) {
          console.error('Error processing video file:', error);
        }
      }
    }
    if (req.body.videos && Array.isArray(req.body.videos)) {
      for (const videoData of req.body.videos) {
        if (videoData.base64 && videoData.name) {
          try {
            const processedVideo = await processMedia(videoData);
            newVideos.push(processedVideo);
          } catch (error) {
            console.error('Error processing base64 video:', error);
          }
        }
      }
    }
    if (newVideos.length > 0) {
      updateData.videos = [...(project.videos || []), ...newVideos];
    }

    const updatedProject = await ProjectMarketplace.findByIdAndUpdate(
      id,
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate('seller', 'username email profilePicture');

    // cache.clear(); // Fixed ReferenceError: cache is not defined

    res.status(200).json({
      success: true,
      message: 'Project updated successfully',
      project: updatedProject
    });

  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating project',
      error: error.message
    });
  }
};

export const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    if (project.seller.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this project'
      });
    }

    // Delete images and videos from Cloudinary if they exist
    if ((project.images && project.images.length > 0) || (project.videos && project.videos.length > 0)) {
      try {
        const imageDeletePromises = (project.images || [])
          .filter(img => img.public_id)
          .map(img => deleteImageFromCloudinary(img.public_id));
        
        const videoDeletePromises = (project.videos || [])
          .filter(vid => vid.public_id)
          .map(vid => deleteImageFromCloudinary(vid.public_id));
        
        await Promise.all([...imageDeletePromises, ...videoDeletePromises]);
        console.log('Media deleted from Cloudinary successfully');
      } catch (cloudinaryError) {
        console.error('Error deleting media from Cloudinary:', cloudinaryError);
        // Continue with project deletion even if media deletion fails
      }
    }

    await ProjectMarketplace.findByIdAndDelete(id);
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting project',
      error: error.message
    });
  }
};

export const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const isLiked = await project.toggleLike(userId);
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    // Emit real-time update to all connected clients
    if (ioGlobal) {
      ioGlobal.emit('projectLikeUpdated', {
        projectId: id,
        isLiked,
        likesCount: project.likeCount,
        userId: userId
      });
    }

    res.status(200).json({
      success: true,
      isLiked,
      likesCount: project.likeCount,
      message: isLiked ? 'Project liked' : 'Project unliked'
    });

  } catch (error) {
    console.error('Error toggling like:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling like',
      error: error.message
    });
  }
};

export const toggleSave = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    const isSaved = await project.toggleSave(userId);
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    // Emit real-time update to all connected clients
    if (ioGlobal) {
      ioGlobal.emit('projectSaveUpdated', {
        projectId: id,
        isSaved,
        savesCount: project.saveCount,
        userId: userId
      });
    }

    res.status(200).json({
      success: true,
      isSaved,
      savesCount: project.saveCount,
      message: isSaved ? 'Project saved' : 'Project unsaved'
    });

  } catch (error) {
    console.error('Error toggling save:', error);
    res.status(500).json({
      success: false,
      message: 'Error toggling save',
      error: error.message
    });
  }
};

export const getFeaturedProjects = async (req, res) => {
  try {
    const cacheKey = 'marketplace:featured';
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const projects = await ProjectMarketplace.getFeatured();
    const response = { success: true, projects };

    await redisClient.setEx(cacheKey, 600, JSON.stringify(response));
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching featured projects:', error);
    res.status(500).json({ success: false, message: 'Error fetching projects' });
  }
};

export const getTrendingProjects = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const cacheKey = `marketplace:trending:${userId || 'guest'}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const projects = await ProjectMarketplace.getTrending();
    const projectsWithStats = projects.map(project => ({
      ...project,
      isLiked: userId ? project.userLikes?.some(id => id.toString() === userId.toString()) : false,
      isSaved: userId ? project.userSaves?.some(id => id.toString() === userId.toString()) : false
    }));

    const response = { success: true, projects: projectsWithStats };
    await redisClient.setEx(cacheKey, 300, JSON.stringify(response));
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching trending projects:', error);
    res.status(500).json({ success: false, message: 'Error fetching projects' });
  }
};

export const getProjectsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const { limit = 10 } = req.query;
    const cacheKey = `marketplace:cat:${category}:${limit}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }

    const projects = await ProjectMarketplace.getByCategory(category).limit(parseInt(limit));
    const response = { success: true, projects };
    await redisClient.setEx(cacheKey, 600, JSON.stringify(response));
    res.status(200).json(response);
  } catch (error) {
    console.error('Error fetching projects by category:', error);
    res.status(500).json({ success: false, message: 'Error fetching projects' });
  }
};

export const getUserLikes = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `user-likes:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }
    
    const projects = await ProjectMarketplace.find({
      userLikes: userId,
      status: 'published',
      isActive: true
    })
    .populate('seller', 'username profilePicture rating')
    .sort({ createdAt: -1 })
    .lean();

    const response = {
      success: true,
      likedProjects: projects
    };

    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching user likes:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user likes',
      error: error.message
    });
  }
};

export const getUserSaves = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const cacheKey = `user-saves:${userId}`;
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return res.status(200).json(JSON.parse(cached));
    }
    
    const projects = await ProjectMarketplace.find({
      userSaves: userId,
      status: 'published',
      isActive: true
    })
    .populate('seller', 'username profilePicture rating')
    .sort({ createdAt: -1 })
    .lean();

    const response = {
      success: true,
      savedProjects: projects
    };

    await redisClient.setEx(cacheKey, 60, JSON.stringify(response));

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching user saves:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user saves',
      error: error.message
    });
  }
};

export const addInquiry = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    const userId = req.user._id || req.user.id;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    project.inquiries.push({
      user: userId,
      message: message.trim(),
      inquiredAt: new Date()
    });

    await project.save();
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    res.status(200).json({
      success: true,
      message: 'Inquiry sent successfully'
    });

  } catch (error) {
    console.error('Error adding inquiry:', error);
    res.status(500).json({
      success: false,
      message: 'Error sending inquiry',
      error: error.message
    });
  }
};

// Admin routes
export const getAdminProjects = async (req, res) => {
  try {
    const { page = 1, limit = 50, status, category } = req.query;
    
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    if (category && category !== 'all') {
      filter.category = category;
    }

    const [projects, total] = await Promise.all([
      ProjectMarketplace.find(filter)
        .populate('seller', 'username email profilePicture')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit))
        .lean(),
      ProjectMarketplace.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      projects,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalProjects: total
      }
    });

  } catch (error) {
    console.error('Error fetching admin projects:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching projects',
      error: error.message
    });
  }
};

export const deleteAdminProject = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    await ProjectMarketplace.findByIdAndDelete(id);
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    res.status(200).json({
      success: true,
      message: 'Project deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting admin project:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting project',
      error: error.message
    });
  }
};

export const getProjectRating = async (req, res) => {
  try {
    const { id } = req.params;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Get project ratings from ProjectPurchase collection
    const ratings = await ProjectPurchase.find({
      project: id,
      rating: { $exists: true, $ne: null }
    }).populate('buyer', 'username');

    const totalRatings = ratings.length;
    const averageRating = totalRatings > 0 
      ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings 
      : 0;

    const individualRatings = ratings.map(r => ({
      rating: r.rating,
      comment: r.review || r.comment || '',
      buyerName: r.buyer?.username || 'Anonymous',
      ratedAt: r.ratedAt || r.updatedAt || r.createdAt
    }));

    res.status(200).json({
      success: true,
      data: {
        hasRatings: totalRatings > 0,
        averageRating: Math.round(averageRating * 10) / 10,
        totalRatings,
        individualRatings
      }
    });

  } catch (error) {
    console.error('Error fetching project rating:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching project rating',
      error: error.message
    });
  }
};

export const incrementProjectView = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.user?.id;

    const project = await ProjectMarketplace.findById(id);
    
    if (!project) {
      return res.status(404).json({
        success: false,
        message: 'Project not found'
      });
    }

    // Increment view count
    const updatedProject = await ProjectMarketplace.findByIdAndUpdate(
      id, 
      { $inc: { viewCount: 1 } },
      { new: true }
    );
    // cache.clear(); // Fixed ReferenceError: cache is not defined

    // Emit real-time update to all connected clients
    if (ioGlobal) {
      ioGlobal.emit('projectViewUpdated', {
        projectId: id,
        viewCount: updatedProject.viewCount
      });
    }

    res.status(200).json({
      success: true,
      message: 'View count incremented',
      viewCount: updatedProject.viewCount
    });

  } catch (error) {
    console.error('Error incrementing project view:', error);
    res.status(500).json({
      success: false,
      message: 'Error incrementing project view',
      error: error.message
    });
  }
};
