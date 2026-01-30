import Brand from "../../model/brandModel.js";
import Category from "../../model/categoryModel.js";

import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";

const listProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const sort = req.query.sort || "newest";
    const category = req.query.category || "";
    const status = req.query.status || "";

    /* 🔍 BUILD FILTER QUERY */
    const searchQuery = {};

    // Search by product name
    if (search) {
      searchQuery.productName = { $regex: search, $options: "i" };
    }

    // Filter by category
    if (category) {
      searchQuery.categoryId = category;
    }

    // Filter by status
    if (status === "active") {
      searchQuery.isActive = true;
    }
    if (status === "inactive") {
      searchQuery.isActive = false;
    }

    /* 🔃 SORTING */
    let sortQuery = { createdAt: -1 };
    if (sort === "name_asc") sortQuery = { productName: 1 };
    if (sort === "name_desc") sortQuery = { productName: -1 };

    /* 📦 FETCH PRODUCTS */
    const products = await Product.find(searchQuery)
      .populate("categoryId")
      .populate("brandId")
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .lean();

    const productIds = products.map(p => p._id);

    /* 🧮 VARIANT AGGREGATION */
    const variants = await Variant.aggregate([
      { $match: { product: { $in: productIds } } },
      {
        $group: {
          _id: "$product",
          totalStock: { $sum: "$stock" },
          coverImage: { $first: "$coverImage" }
        }
      }
    ]);

    const variantMap = {};
    variants.forEach(v => {
      variantMap[v._id.toString()] = v;
    });

    const finalProducts = products.map(p => ({
      ...p,
      totalStock: variantMap[p._id]?.totalStock || 0,
      coverImage: variantMap[p._id]?.coverImage || "/images/placeholder.png"
    }));

    const totalProducts = await Product.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalProducts / limit);

    /* 🟢 AJAX RESPONSE */
    if (req.xhr) {
      return res.json({
        success: true,
        products: finalProducts,
        pagination: {
          page,
          totalPages,
          totalProducts
        }
      });
    }

    /* 🟢 NORMAL RENDER */
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



const validateProductInput = ({
  productName,
  brandId,
  categoryId,
  description,
  petType
}) => {
  if (!productName || productName.trim().length < 3) {
    return "Product name must be at least 3 characters";
  }

  if (!brandId) {
    return "Brand is required";
  }

  if (!categoryId) {
    return "Category is required";
  }

  if (!Array.isArray(petType) || petType.length === 0) {
  return "At least one pet type is required";
}

  if (!description || description.trim().length < 10 || description.length > 250) {
    return "Description must be between 10 and 250 characters";
  }

  return null;
};




const postAddProduct = async (req, res) => {
  try {
    let petType = req.body.petType;

    if (typeof petType === "string") {
      petType = [petType];
    }

    const error = validateProductInput({
      ...req.body,
      petType
    });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    await Product.create({
      productName: req.body.productName.trim(),
      brandId: req.body.brandId,
      categoryId: req.body.categoryId,
      description: req.body.description.trim(),
      petType,
      isActive: req.body.isActive === "true"
    });

    return res.json({ success: true });

  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};




const updateProduct = async (req, res) => {
  try {
    let petType = req.body.petType;

    if (typeof petType === "string") {
      petType = [petType];
    }

    const error = validateProductInput({
      ...req.body,
      petType
    });

    if (error) {
      return res.status(400).json({ success: false, message: error });
    }

    await Product.findByIdAndUpdate(req.params.id, {
      productName: req.body.productName.trim(),
      brandId: req.body.brandId,
      categoryId: req.body.categoryId,
      description: req.body.description.trim(),
      petType,
      isActive: req.body.isActive === "true"
    });

    return res.json({ success: true });

  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
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