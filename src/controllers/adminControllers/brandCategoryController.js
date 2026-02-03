import Brand from '../../model/brandModel.js'
import Category from '../../model/categoryModel.js';
import Product from '../../model/productModel.js'

const getBrandsPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";
    const sort = req.query.sort || "newest";

    /* ------------------ FILTER ------------------ */
    const filter = {};

    if (search) {
      filter.brandName = { $regex: search, $options: "i" };
    }

    /* ------------------ SORT ------------------ */
    let sortOption = { createdAt: -1 }; // newest (default)

    if (sort === "name_asc") sortOption = { brandName: 1 };
    if (sort === "name_desc") sortOption = { brandName: -1 };

    /* ------------------ QUERY ------------------ */
    const totalBrands = await Brand.countDocuments(filter);

    const brands = await Brand.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    /* ------------------ PRODUCT COUNT ------------------ */
    const brandsWithCount = await Promise.all(
      brands.map(async (brand) => {
        const productCount = await Product.countDocuments({
          brandId: brand._id
        });

        return {
          ...brand,
          productCount
        };
      })
    );

    const totalPages = Math.ceil(totalBrands / limit);

    /* ------------------ AJAX RESPONSE ------------------ */
    if (req.headers["x-requested-with"] === "XMLHttpRequest") {
      return res.json({
        success: true,
        brands: brandsWithCount,
        pagination: {
          page,
          totalPages,
          totalBrands,
          limit
        }
      });
    }

    /* ------------------ NORMAL PAGE LOAD ------------------ */
    const totalProducts = await Product.countDocuments();

    res.render("admin/brands", {
      brands: brandsWithCount,
      totalBrands,
      totalProducts,
      currentPage: page,
      totalPages
    });

  } catch (error) {
    console.error("Get Brands Error:", error);
    res.status(500).send("Server Error");
  }
};


const editBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const { name, status } = req.body;

    await Brand.findByIdAndUpdate(brandId, {
      brandName: name.trim(),
      isActive: status === "Active"
    });

    res.redirect('/admin/brands?success=Brand updated successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/brands?error=Failed to update brand');
  }
};


const deleteBrand = async (req, res) => {
  try {
    const { brandId } = req.params;

    await Brand.findByIdAndDelete(brandId);

    res.redirect('/admin/brands?success=Brand deleted successfully');
  } catch (err) {
    console.error(err);
    res.redirect('/admin/brands?error=Failed to delete brand');
  }
};


const addBrand = async (req, res) => {
  try {
    const { name, status } = req.body;

    if (!name || !name.trim()) {
      return res.redirect('/admin/brands?error=Invalid brand name');
    }

    await Brand.create({
      brandName: name.trim(),
      isActive: status === "Active"
    });

    res.redirect('/admin/brands?success=Brand added successfully');
  } catch (err) {
    console.error("Add Brand Error:", err.message);
    res.redirect('/admin/brands?error=Brand already exists');
  }
};




const getCategoriesPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8;
    const skip = (page - 1) * limit;

    const totalCategories = await Category.countDocuments();

    const sort = req.query.sort || "latest";

    let sortOption = { createdAt: -1 }; // default: recently added

    if (sort === "oldest") {
      sortOption = { createdAt: 1 };
    }

    if (sort === "active") {
      sortOption = { isActive: -1, createdAt: -1 };
    }

    if (sort === "inactive") {
      sortOption = { isActive: 1, createdAt: -1 };
    }

    const categories = await Category.find()
      .sort(sortOption)
      .skip(skip)
      .limit(limit)
      .lean();

    const categoriesWithCount = await Promise.all(
      categories.map(async (cat) => {
        const count = await Product.countDocuments({ categoryId: cat._id });
        return {
          _id: cat._id,
          name: cat.categoryName,   // ✅ map here
          isActive: cat.isActive,
          status: cat.isActive ? "Active" : "Inactive",
          itemCount: count

        };
      })
    );

    const totalPages = Math.ceil(totalCategories / limit);

    res.render("admin/categories", {
      categories: categoriesWithCount,
      currentPage: page,
      totalPages,
      totalCategories,
      limit,
      sort
    });
  } catch (err) {
    console.error(err);
    res.redirect("/admin/dashboard");
  }
};


const addCategory = async (req, res) => {
  try {
    const { name, status } = req.body;
    console.log(req.body)

    if (!name || !name.trim()) {
      return res.json({ success: false, message: "Invalid category name" });
    }

    const exists = await Category.findOne({
      categoryName: { $regex: `^${name.trim()}$`, $options: "i" }
    });

    if (exists) {
      return res.json({
        success: false,
        message: "Category already exists"
      });
    }

    await Category.create({
      categoryName: name.trim(),
      isActive: status === "Active"
    });

    return res.json({
      success: true,
      message: "Category added successfully"
    });

  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      message: "Something went wrong"
    });
  }
};


const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    console.log(req.body)

    const exists = await Category.findOne({
      categoryName: { $regex: `^${name.trim()}$`, $options: "i" },
      _id: { $ne: id }
    });

    if (exists) {
      return res.json({
        success: false,
        message: "Category already exists"
      });
    }

    await Category.findByIdAndUpdate(id, {
      categoryName: name.trim(),
      isActive: status === "Active"
    });

    return res.json({
      success: true,
      message: "Category updated successfully"
    });

  } catch (err) {
    console.error(err);
    return res.json({
      success: false,
      message: "Failed to update category"
    });
  }
};



const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;

    const categoryExists = await Category.findById(id);
    if (!categoryExists) {
      return res.json({
        success: false,
        message: "Category not found"
      });
    }

    const productCount = await Product.countDocuments({ categoryId: id });
    if (productCount > 0) {
      return res.json({
        success: false,
        message: "Cannot delete category with products"
      });
    }

    await Category.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: "Category deleted successfully"
    });

  } catch (error) {
    console.error("Delete Category Error:", error);
    return res.json({
      success: false,
      message: "Failed to delete category"
    });
  }
};





export default { getBrandsPage, editBrand, deleteBrand, addBrand, getCategoriesPage, addCategory, editCategory, deleteCategory }