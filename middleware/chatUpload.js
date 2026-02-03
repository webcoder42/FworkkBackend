import multer from "multer";

// Use memory storage to stream directly to Cloudinary
const storage = multer.memoryStorage();

// Filter for allowed chat files
const fileFilter = (req, file, cb) => {
  // Allowed types: Images, PDFs, Docs, Text, Archives
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/x-rar-compressed'
  ];
  
  // Also check extension as a fallback
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.zip', '.rar'];
  const ext = file.originalname.toLowerCase().match(/\.[0-9a-z]+$/i)?.[0];

  if (allowedMimeTypes.includes(file.mimetype) || (ext && allowedExtensions.includes(ext))) {
    cb(null, true);
  } else {
    cb(new Error('File type not supported for chat'), false);
  }
};

const chatUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB limit
  },
});

export default chatUpload;
