import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";

const homePage = async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate("categoryId", "categoryName")
      .lean();

    // ✅ CORRECT
    const productIds = products.map(p => p._id);

    const variants = await Variant.aggregate([
  {
    $addFields: {
      productObjId: {
        $toObjectId: "$product"
      }
    }
  },
  {
    $match: {
      productObjId: { $in: productIds }
    }
  },
  {
    $group: {
      _id: "$productObjId",
      price: { $min: "$price" },
      coverImage: { $first: "$coverImage" }
    }
  }
]);

    const variantMap = {};
    variants.forEach(v => {
      variantMap[v._id.toString()] = v;
    });

    const finalProducts = products
      .map(p => {
        const v = variantMap[p._id.toString()];
        if (!v) return null;

        return {
          name: p.productName,
          category: p.categoryId?.categoryName || "Uncategorized",
          image: v.coverImage,
          price: v.price,
          salePrice: null,
          rating: 4,
          isSale: false,
          isBestSeller: false
        };
      })
      .filter(Boolean);

    console.log("FINAL PRODUCTS:", finalProducts);
    console.log("PRODUCT IDS:", productIds);
console.log("VARIANTS FOUND:", variants);


    res.render("user/home", { products: finalProducts });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

export default { homePage };
