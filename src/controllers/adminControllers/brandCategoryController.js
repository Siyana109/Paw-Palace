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

        const categories = await Category.find()
            .sort({ createdAt: -1 })
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
            limit
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
            return res.redirect('/admin/categories?error=Invalid category name');
        }

        await Category.create({
            categoryName: name.trim(),
            isActive: status === 'Active'
        });

        res.redirect('/admin/categories?success=Category added successfully');

    } catch (error) {
        if (error.code === 11000) {
            return res.redirect('/admin/categories?error=Category already exists');
        }

        console.error('Add Category Error:', error);
        res.redirect('/admin/categories?error=Failed to add category');
    }
};

const editCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        if (!name || !name.trim()) {
            return res.redirect('/admin/categories?error=Invalid category name');
        }


        const updated = await Category.findByIdAndUpdate(
            id,
            {
                categoryName: name.trim(),
                isActive: status === 'Active'
            },
            { new: true, runValidators: true }
        );

        if (!updated) {
            return res.redirect('/admin/categories?error=Category not found');
        }

        res.redirect('/admin/categories?success=Category updated successfully');

    } catch (error) {
        console.error('Edit Category Error:', error);
        res.redirect('/admin/categories?error=Failed to update category');
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