import multer from "multer";

// Use memory storage to stream directly to Cloudinary
const storage = multer.memoryStorage();

// Filter for allowed marketplace files (Images and Videos)
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-msvideo'
  ];
  
  const ext = file.originalname.toLowerCase().match(/\.[0-9a-z]+$/i)?.[0];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.avi', '.webm'];

  if (allowedMimeTypes.includes(file.mimetype) || (ext && allowedExtensions.includes(ext))) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported for project listing'), false);
  }
};

const marketplaceUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit for videos
  },
});

export default marketplaceUpload;
