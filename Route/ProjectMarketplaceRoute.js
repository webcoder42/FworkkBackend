import express from 'express';
import {
  createProject,
  getAllProjects,
  getProject,
  getUserProjects,
  getProjectForEdit,
  updateProject,
  deleteProject,
  toggleLike,
  toggleSave,
  getFeaturedProjects,
  getTrendingProjects,
  getProjectsByCategory,
  getUserLikes,
  getUserSaves,
  addInquiry,
  getAdminProjects,
  deleteAdminProject,
  getProjectRating,
  incrementProjectView
} from '../Controller.js/ProjectMarketplaceController.js';
import { requireSignIn } from '../middleware/UserMiddleware.js';
import upload from '../middleware/uploadimage.js';
import { getCloudinaryConfig } from '../services/cloudinaryService.js';
import { cacheMiddleware } from '../middleware/cacheMiddleware.js';

const router = express.Router();

// Test Cloudinary configuration
router.get('/cloudinary-config', (req, res) => {
  try {
    const config = getCloudinaryConfig();
    res.json({
      success: true,
      message: 'Cloudinary configuration loaded',
      config: {
        cloud_name: config.cloud_name,
        folder: config.folder
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Cloudinary configuration error',
      error: error.message
    });
  }
});

// Public routes
router.get('/projects', getAllProjects);
router.get('/projects/featured', getFeaturedProjects);
router.get('/projects/trending', getTrendingProjects);
router.get('/projects/category/:category', getProjectsByCategory);
router.get('/projects/:id', getProject);

// Protected routes
router.use(requireSignIn);

import marketplaceUpload from '../middleware/marketplaceUpload.js';

router.post('/projects', marketplaceUpload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 3 }]), createProject);
router.get('/user/projects', getUserProjects);
router.get('/user/projects/:id/edit', getProjectForEdit);
router.put('/projects/:id', marketplaceUpload.fields([{ name: 'images', maxCount: 10 }, { name: 'videos', maxCount: 3 }]), updateProject);
router.delete('/projects/:id', deleteProject);

router.post('/projects/:id/like', toggleLike);
router.post('/projects/:id/save', toggleSave);

router.get('/user-likes' ,getUserLikes);
router.get('/user-saves', getUserSaves);

router.post('/projects/:id/inquiry', addInquiry);

// Admin routes
router.get('/admin/projects', getAdminProjects);
router.delete('/admin/projects/:id', deleteAdminProject);

// Project rating route
router.get('/project-rating/:id', getProjectRating);

// View increment route
router.post('/projects/:id/view', incrementProjectView);

export default router;
