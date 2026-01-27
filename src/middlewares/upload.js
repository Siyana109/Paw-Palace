import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const variantStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "pawpalace/variants",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const variantUpload = multer({
  storage: variantStorage,
  limits: { files: 6 }, // example: 1 cover + 5 images
});

const memoryStorage = multer.memoryStorage();

const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"), false);
    }
  },
});

export {
  variantUpload,
  upload,
};
