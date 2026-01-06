import express from "express"
const router = express.Router()

import adminMiddleware from "../middlewares/adminMiddleware.js"

import authController from "../controllers/adminControllers/authController.js"
import userController from "../controllers/adminControllers/userController.js"

import brandCategoryController from "../controllers/adminControllers/brandCategoryController.js"
import productController from "../controllers/adminControllers/productController.js"
import variantController from "../controllers/adminControllers/variantController.js"


router.get('/login', adminMiddleware.isAdminLoggedIn, authController.getAdmin)
router.post('/login', authController.postAdmin)

router.get('/users', adminMiddleware.adminSession, userController.getUsers)
router.post('/users/:userId/block', adminMiddleware.adminSession, userController.blockUser)
router.post('/users/:userId/unblock', adminMiddleware.adminSession, userController.unblockUser);
router.get("/users/list", adminMiddleware.adminSession, userController.listUsers);

router.get('/brands',adminMiddleware.adminSession, brandCategoryController.getBrandsPage)
router.post('/brands/edit/:brandId', adminMiddleware.adminSession, brandCategoryController.editBrand)
router.post('/brands/delete/:brandId', adminMiddleware.adminSession, brandCategoryController.deleteBrand)
router.post('/brands/add', adminMiddleware.adminSession, brandCategoryController.addBrand)

router.get('/categories',adminMiddleware.adminSession, brandCategoryController.getCategoriesPage)
router.post('/categories/add',adminMiddleware.adminSession, brandCategoryController.addCategory);
router.post('/categories/edit/:id', adminMiddleware.adminSession, brandCategoryController.editCategory);
router.post('/categories/delete/:id', adminMiddleware.adminSession, brandCategoryController.deleteCategory);


router.get("/products", productController.listProducts);
/* ADD PRODUCT SUBMIT */
router.post(
  "/products/add",
  adminMiddleware.adminSession,
  productController.postAddProduct
);

/* PRODUCT VIEW */
router.get("/products/view/:id", productController.viewProduct);

/* PRODUCT EDIT */
router.get("/products/edit/:id", productController.editProduct);
router.post(
  "/products/edit/:id",
  adminMiddleware.adminSession,
  productController.updateProduct
);





/* LOAD VARIANT FORM (AJAX) */
router.get("/products/:id/variant-form", productController.getVariantForm);

/* ADD VARIANT */
router.post(
  "/products/:productId/variants",
  adminMiddleware.adminSession,
  variantController.addVariant
);

/* LIST VARIANTS (OPTIONAL PAGE) */
router.get("/products/:productId/variants", variantController.listVariants);

/* DELETE VARIANT */
router.delete("/variants/:variantId", variantController.deleteVariant);

export default router