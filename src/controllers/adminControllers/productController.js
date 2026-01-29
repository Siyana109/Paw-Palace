import Brand from "../../model/brandModel.js";
import Category from "../../model/categoryModel.js";

import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";

const listProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search || "";
    const sort = req.query.sort || "newest";

    const skip = (page - 1) * limit;

    /* 🔍 Search filter */
    const searchQuery = {
      productName: { $regex: search, $options: "i" }
    };

    /* 🔃 Sorting */
    let sortQuery = { createdAt: -1 };
    if (sort === "name_asc") sortQuery = { productName: 1 };
    if (sort === "name_desc") sortQuery = { productName: -1 };

    /* 📦 Fetch products */
    const products = await Product.find(searchQuery)
      .populate("categoryId")
      .populate("brandId")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const productIds = products.map(p => p._id);

    /* 🧮 Variant aggregation */
    const variants = await Variant.aggregate([
      { $match: { product: { $in: productIds } } },
      {
        $group: {
          _id: "$product",
          minPrice: { $min: "$price" },
          totalStock: { $sum: "$stock" },
          coverImage: { $first: "$coverImage" }
        }
      }
    ]);

    const variantMap = {};
    variants.forEach(v => variantMap[v._id.toString()] = v);

    const finalProducts = products.map(p => ({
      ...p,
      minPrice: variantMap[p._id]?.minPrice || 0,
      totalStock: variantMap[p._id]?.totalStock || 0,
      coverImage: variantMap[p._id]?.coverImage || "/images/placeholder.png"
    }));

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    /* 🟢 AJAX response */
    if (req.xhr) {
      return res.json({
        success: true,
        products: finalProducts,
        pagination: { page, totalPages, totalProducts }
      });
    }

    /* 🟢 Normal render */
    const brands = await Brand.find({ isActive: true }).lean();
    const categories = await Category.find({ isActive: true }).lean();

    res.render("admin/products", {
      products: finalProducts,
      totalProducts,
      page,
      totalPages,
      brands,
      categories
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};


const postAddProduct = async (req, res) => {
  try {
    const { productName, brandId, categoryId, description, isActive, petType } = req.body;

    // basic validation
    if (!productName || !brandId || !categoryId || !description || !petType) {
      // Create flash message or handle error better in real app
      console.log("Missing fields", req.body);
      return res.redirect("/admin/products");
    }

    await Product.create({
      productName,
      brandId,
      categoryId,
      description,
      petType,
      isActive: isActive === "true"
    });

    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    res.redirect("/admin/products");
  }
};


const updateProduct = async (req, res) => {
  const { productName, brandId, categoryId, description, isActive, petType } = req.body;

  await Product.findByIdAndUpdate(req.params.id, {
    productName,
    brandId,
    categoryId,
    description,
    petType,
    isActive: isActive === "true"
  });

  res.redirect("/admin/products");
};


// DELETE PRODUCT (AJAX)
const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    // delete variants
    await Variant.deleteMany({ product: productId });

    // delete product
    await Product.findByIdAndDelete(productId);

    return res.json({ success: true });

  } catch (err) {
    console.error(" Delete product error:", err);
    res.json({ success: false });
  }
};



export default { listProducts, postAddProduct, updateProduct, deleteProduct }