import cloudinary from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

// Debug: Check environment variables
// (console removed)

// Configure Cloudinary
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Upload image to Cloudinary
export const uploadImageToCloudinary = async (
  imageData,
  folder = "project-images"
) => {
  try {
    // (console removed)

    // If imageData is base64
    if (imageData.base64) {
      // (console removed)

      // Different transformations based on folder type
      const isImage = imageData.type?.startsWith('image/');
      const isVideo = imageData.type?.startsWith('video/');
      let transformations = [];

      if (isImage) {
        if (folder === "profile-images") {
          transformations = [
            { width: 400, height: 400, crop: "fill", gravity: "face" },
            { radius: "max" },
            { quality: "auto", fetch_format: "auto" },
          ];
        } else if (folder === "portfolio-images") {
          transformations = [
            { width: 800, height: 600, crop: "limit" },
            { quality: "auto", fetch_format: "auto" },
          ];
        } else {
          transformations = [
            { width: 1200, height: 1200, crop: "limit" },
            { quality: "auto", fetch_format: "auto" },
          ];
        }
      } else if (isVideo) {
        transformations = [
          { quality: "auto" }
        ];
      }

      const uploadOptions = {
        folder: folder,
        resource_type: isVideo ? "video" : isImage ? "image" : "raw",
      };

      if (transformations.length > 0) {
        uploadOptions.transformation = transformations;
      }

      const result = await cloudinary.v2.uploader.upload(imageData.base64, uploadOptions);

      // (console removed)

      // Ensure the URL has an extension for non-image files to help with downloads
      let finalUrl = result.secure_url;
      if (!isImage && result.format && !finalUrl.toLowerCase().endsWith('.' + result.format.toLowerCase())) {
        // Cloudinary allows appending the format to the public_id in the URL
        if (finalUrl.includes(result.public_id) && !finalUrl.includes(result.public_id + '.' + result.format)) {
            finalUrl = finalUrl.replace(result.public_id, `${result.public_id}.${result.format}`);
        }
      }

      return {
        url: finalUrl,
        public_id: result.public_id,
        filename: imageData.name,
        size: imageData.size || 0,
        mimetype: imageData.type || "image/jpeg",
        uploadedAt: new Date(),
      };
    }

    // If imageData is a file buffer
    if (imageData.buffer) {
      // Wrap stream upload in a Promise
      const result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream(
          {
            folder: folder,
            resource_type: "auto",
            transformation: [
              { width: 800, height: 600, crop: "limit" },
              { quality: "auto", fetch_format: "auto" },
            ],
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary stream error:", error);
              return reject(error);
            }
            resolve(result);
          }
        );
        uploadStream.end(imageData.buffer);
      });

      return {
        url: result.secure_url,
        public_id: result.public_id,
        filename: imageData.originalname,
        size: imageData.size || 0,
        mimetype: imageData.mimetype,
        uploadedAt: new Date(),
      };
    }

    throw new Error("Invalid image data format");
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

// Delete image from Cloudinary
export const deleteImageFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.v2.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw error;
  }
};

// Upload multiple images
export const uploadMultipleImages = async (
  imagesArray,
  folder = "project-images"
) => {
  try {
    // (console removed)
    const uploadPromises = imagesArray.map((imageData) =>
      uploadImageToCloudinary(imageData, folder)
    );

    const results = await Promise.all(uploadPromises);
    // (console removed)
    return results;
  } catch (error) {
    console.error("Multiple images upload error:", error);
    throw error;
  }
};

// Get Cloudinary configuration info
export const getCloudinaryConfig = () => {
  return {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    folder: "project-images",
  };
};

// Specific function for profile image uploads
export const uploadProfileImage = async (imageData) => {
  return uploadImageToCloudinary(imageData, "profile-images");
};

// Specific function for portfolio image uploads
export const uploadPortfolioImage = async (imageData) => {
  return uploadImageToCloudinary(imageData, "portfolio-images");
};

// Specific function for complaint image uploads
export const uploadComplaintImage = async (imageData) => {
  return uploadImageToCloudinary(imageData, "complaint-images");
};

// Upload file to Cloudinary (for file paths)
export const uploadToCloudinary = async (filePath, folder = "general") => {
  try {
    const result = await cloudinary.v2.uploader.upload(filePath, {
      folder: folder,
      resource_type: "auto",
      transformation: [{ quality: "auto", fetch_format: "auto" }],
    });

    return {
      secure_url: result.secure_url,
      public_id: result.public_id,
    };
  } catch (error) {
    console.error("Cloudinary upload error:", error);
    throw error;
  }
};

// Delete from Cloudinary using URL
export const deleteFromCloudinary = async (imageUrl) => {
  try {
    // Extract public_id from URL
    const urlParts = imageUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const publicId = filename.split(".")[0];

    const result = await cloudinary.v2.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error("Cloudinary delete error:", error);
    throw error;
  }
};
