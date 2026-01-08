import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";
import { CloudinaryStorage } from "multer-storage-cloudinary";


const postAddVariant = async (req, res) => {
  try {
    console.log('error 1')
    const { productId, price, stock, size, color } = req.body;
    console.log(req.files);


    if (!productId || !price || !stock) {
      return res.redirect("/admin/products");
    }
console.log('error 2')
    const product = await Product.findById(productId);
    if (!product) {
      return res.redirect("/admin/products");
    }
console.log('error 3')
    /* ---------- Cloudinary Files ---------- */
    // cover image
    const coverImage = req.files?.coverImage?.[0]?.path;
    if (!coverImage) {
      console.log("❌ Cover image missing");
      return res.redirect("/admin/products");
    }
console.log('error 4')
    // sub images
    const subImages =
      req.files?.subImages?.map(file => file.path) || [];
console.log('error 5')
    /* ---------- Create Variant ---------- */
    await Variant.create({
      product: productId,
      price: Number(price),
      stock: Number(stock),
      size: size || null,
      color: color || null,
      coverImage,
      subImages,
      isActive: true,
    });
console.log('error 6')
    console.log("✅ Variant created with Cloudinary images");
    res.redirect("/admin/products");
console.log('error 7')
  } catch (error) {
    console.error("❌ Error adding variant:", error);
    res.redirect("/admin/products");
  }
};


const getVariantsByProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const variants = await Variant.find({ product: productId }).lean();

    res.json({ success: true, variants });

  } catch (error) {
    console.error("❌ Error fetching variants:", error);
    res.status(500).json({ success: false });
  }
};



//   DELETE VARIANT
// DELETE VARIANT (FINAL)
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



export default { deleteVariant, postAddVariant, getVariantsByProduct }