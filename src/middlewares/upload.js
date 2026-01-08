import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "pawpalace/variants",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
  },
});

const variantUpload = multer({
  storage,
  limits: { files: 6 }, // 1 cover + 3 sub
});

export default variantUpload;
