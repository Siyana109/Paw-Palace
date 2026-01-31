import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";


const postAddVariant = async (req, res) => {
  try {
    const { productId, price, stock, size, color } = req.body;

    if (!productId || !price || !stock) {
      return res.json({ success: false, message: "Missing required fields" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.json({ success: false, message: "Product not found" });
    }

    const coverImage = req.files?.coverImage?.[0]?.path;
    if (!coverImage) {
      return res.json({ success: false, message: "Cover image required" });
    }

    const subImages = req.files?.subImages?.map(f => f.path) || [];

    if (subImages.length < 3) {
      return res.json({ success: false, message: "Minimum 3 images required" });
    }

    await Variant.create({
      product: productId,
      price: Number(price),
      stock: Number(stock),
      size: size || null,
      color: color || null,
      coverImage,
      subImages,
      isActive: true
    });

    // Update product stock
    const variants = await Variant.find({ product: productId });
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

    await Product.findByIdAndUpdate(productId, { totalStock });

    return res.json({ success: true });

  } catch (error) {
    console.error("Add variant error:", error);
    return res.json({ success: false, message: "Server error" });
  }
};


const getVariantsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await Variant.find({ product: productId }).lean();

    res.json({ success: true, variants });

  } catch (error) {
    console.error(" Error fetching variants:", error);
    res.status(500).json({ success: false });
  }
};



// DELETE VARIANT
const deleteVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) {
      return res.json({ success: false });
    }

    const productId = variant.product;

    // delete variant
    await Variant.findByIdAndDelete(req.params.variantId);

    // recalculate total stock
    const variants = await Variant.find({ product: productId });
    const totalStock = variants.reduce(
      (sum, v) => sum + v.stock,
      0
    );

    // update product stock
    await Product.findByIdAndUpdate(productId, {
      totalStock
    });

    res.json({
      success: true,
      productId,
      totalStock
    });

  } catch (err) {
    console.error("Delete variant error:", err);
    res.json({ success: false });
  }
};



// UPDATE VARIANT
const updateVariant = async (req, res) => {
  try {
    const { variantId } = req.params;
    const { price, stock, size, color } = req.body;

    const variant = await Variant.findById(variantId);
    if (!variant) {
      return res.json({ success: false, message: "Variant not found" });
    }

    // Update fields
    variant.price = Number(price);
    variant.stock = Number(stock);
    variant.size = size || null;
    variant.color = color || null;

    // Handle Image Updates
    if (req.files?.coverImage?.[0]) {
      variant.coverImage = req.files.coverImage[0].path;
    }

    // Handle Sub Images
    let finalSubImages = [];

    // 1. Add kept images
    if (req.body.keptSubImages) {
      try {
        const kept = JSON.parse(req.body.keptSubImages);
        if (Array.isArray(kept)) finalSubImages = [...kept];
      } catch (e) {
        console.error("Error parsing kept sub images", e);
      }
    }

    // 2. Add new images
    if (req.files?.subImages && req.files.subImages.length > 0) {
      const newPaths = req.files.subImages.map(f => f.path);
      finalSubImages = [...finalSubImages, ...newPaths];
    }

    // 3. Validation
    if (finalSubImages.length < 3) {
      return res.json({ success: false, message: "Variant must have at least 3 sub-images (Existing + New)" });
    }

    if (finalSubImages.length > 5) {
      return res.json({ success: false, message: "Variant can have at most 5 sub-images" });
    }

    variant.subImages = finalSubImages;

    await variant.save();

    // Recalculate Product Total Stock
    const productId = variant.product;
    const variants = await Variant.find({ product: productId });
    const totalStock = variants.reduce((sum, v) => sum + v.stock, 0);

    await Product.findByIdAndUpdate(productId, { totalStock });

    res.json({ success: true, message: "Variant updated successfully", totalStock });

  } catch (error) {
    console.error("Update variant error:", error);
    res.json({ success: false, message: "Server error" });
  }
};


export default { deleteVariant, postAddVariant, getVariantsByProduct, updateVariant }