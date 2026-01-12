import Product from "../../model/productModel.js";
import Variant from "../../model/variantModel.js";

const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId)
      .populate("brandId")
      .populate("categoryId");

    if (!product) {
      return res.status(404).render("404");
    }

    const variants = await Variant.find({ product: productId });

    const relatedProducts = await Product.find({
      categoryId: product.categoryId,
      _id: { $ne: productId }
    }).limit(4);

    res.render("user/productDetails", {
      product,
      variants,
      relatedProducts
    });

  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

export default { getProductDetails };
