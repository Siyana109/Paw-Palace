import Brand from '../../model/brandModel.js'
import Category from '../../model/categoryModel.js';
import Product from '../../model/productModel.js'

const getBrandsPage = async (req, res) => {
    try {
        const brands = await Brand.find().sort({ createdAt: -1 }).lean();

        const totalBrands = await Brand.countDocuments()
        const totalProducts = await Product.countDocuments();

        const brandsWithCount = await Promise.all(
            brands.map(async (brand) => {
                const count = await Product.countDocuments({ brandId: brand._id });
                return {
                    ...brand,
                    productCount: count
                };
            })
        );

        res.render('admin/brands', {
            brands: brandsWithCount,
            totalBrands,
            totalProducts
        });
    } catch (err) {
        console.error(err)
        res.status(500).redirect('/admin/dashboard');
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
            return res.redirect('/admin/categories?error=Category not found');
        }

        // Optional safety: prevent delete if products exist
        const productCount = await Product.countDocuments({ categoryId: id });
        if (productCount > 0) {
            return res.redirect(
                '/admin/categories?error=Cannot delete category with products'
            );
        }

        await Category.findByIdAndDelete(id);

        res.redirect('/admin/categories?success=Category deleted successfully');

    } catch (error) {
        console.error('Delete Category Error:', error);
        res.redirect('/admin/categories?error=Failed to delete category');
    }
};




export default { getBrandsPage, editBrand, deleteBrand, addBrand, getCategoriesPage, addCategory, editCategory, deleteCategory }