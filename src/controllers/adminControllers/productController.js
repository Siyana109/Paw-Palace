import Brand from "../../model/brandModel.js";
import Category from "../../model/categoryModel.js";

import Variant from "../../model/variantModel.js";
import Product from "../../model/productModel.js";

const listProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .populate("categoryId").populate("brandId")
      .lean();

    const productIds = products.map(p => p._id);

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
    const brands = await Brand.find({ isActive: true }).lean();
const categories = await Category.find({ isActive: true }).lean();

    res.render("admin/products", {
      products: finalProducts,
      totalProducts: finalProducts.length,
       brands,
  categories
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server Error");
  }
};

const getAddProduct = async (req, res) => {
  try {
    const brands = await Brand.find({ isActive: true }).lean();
    const categories = await Category.find({ isActive: true }).lean();

    res.render("admin/addProduct", {
      brands,
      categories
    });
  } catch (error) {
    console.error(error);
    res.redirect("/admin/products");
  }
};

const postAddProduct = async (req, res) => {
  try {
    const { productName, brandId, categoryId, description } = req.body;

    // basic validation
    if (!productName || !brandId || !categoryId || !description) {
      return res.redirect("/admin/products");
    }

    await Product.create({
      productName,
      brandId,
      categoryId,
      description
    });

    res.redirect("/admin/products");
  } catch (error) {
    console.error(error);
    res.redirect("/admin/products");
  }
};


/* ================================
   LOAD VARIANT FORM (AJAX)
================================ */
const getVariantForm = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).send("Product not found");

    res.render("admin/partials/variantForm", { product });

  } catch (err) {
    res.status(500).send("Error loading variant form");
  }
};

/* ================================
   VIEW PRODUCT
================================ */
const viewProduct = async (req, res) => {
  const product = await Product.findById(req.params.id)
    .populate("categoryId");

  if (!product) return res.redirect("/admin/products");

  res.render("admin/productView", { product });
};

/* ================================
   EDIT PRODUCT
================================ */
const editProduct = async (req, res) => {
  const product = await Product.findById(req.params.id).lean();
  const brands = await Brand.find({ isActive: true }).lean();
  const categories = await Category.find({ isActive: true }).lean();

  if (!product) return res.send("Product not found");

  res.render("admin/partials/editProductForm", {
    product,
    brands,
    categories
  });
};

const updateProduct = async (req, res) => {
  const { productName, brandId, categoryId, description } = req.body;

  await Product.findByIdAndUpdate(req.params.id, {
    productName,
    brandId,
    categoryId,
    description
  });

  res.redirect("/admin/products");
};


export default { listProducts, getVariantForm, viewProduct, editProduct, getAddProduct, postAddProduct, updateProduct }