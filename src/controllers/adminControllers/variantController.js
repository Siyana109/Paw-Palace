import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";

/* ================================
   ADD VARIANT
================================ */

export const addVariant = async (req, res) => {
  try {
    const { productId } = req.params;
    const { price, size, color, stock } = req.body;

    const product = await Product.findById(productId);
    if (!product) return res.redirect("/admin/products");

    // ✅ TEMPORARY SAMPLE IMAGES
    const coverImage = "/images/sample-product.jpg";
    const subImages = [
      "/images/sample-1.jpg",
      "/images/sample-2.jpg"
    ];

    const variant = new Variant({
      product: productId,
      price,
      size: product.hasSize ? size : undefined,
      color: product.hasColor ? color : undefined,
      stock,
      coverImage,
      subImages
    });

    await variant.save();
    res.redirect("/admin/products");

  } catch (error) {
    console.error("Add Variant Error:", error);
    res.status(500).send("Failed to add variant");
  }
};

//   LIST VARIANTS (OPTIONAL PAGE)
const listVariants = async (req, res) => {
  const variants = await Variant.find({ product: req.params.productId });
  res.render("admin/variants", { variants });
};


//   DELETE VARIANT

const deleteVariant = async (req, res) => {
  await Variant.findByIdAndDelete(req.params.variantId);
  res.status(200).json({ success: true });
};



export default { addVariant, listVariants, deleteVariant }