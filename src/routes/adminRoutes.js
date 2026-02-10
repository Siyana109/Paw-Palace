import express from "express"
const router = express.Router()

import adminMiddleware from "../middlewares/adminMiddleware.js"

import authController from "../controllers/adminControllers/authController.js"
import userController from "../controllers/adminControllers/userController.js"

import brandCategoryController from "../controllers/adminControllers/brandCategoryController.js"
import productController from "../controllers/adminControllers/productController.js"
import variantController from "../controllers/adminControllers/variantController.js"

import couponController from "../controllers/adminControllers/couponController.js"
import offerController from "../controllers/adminControllers/offerController.js"
import orderController from "../controllers/adminControllers/orderController.js"
import requestController from "../controllers/adminControllers/requestController.js"

import { variantUpload, upload } from "../middlewares/upload.js"


router.get('/login', adminMiddleware.isAdminLoggedIn, authController.getAdmin)
router.post('/login', authController.postAdmin)

router.get('/users', adminMiddleware.adminSession, userController.getUsers)
router.post('/users/:userId/block', adminMiddleware.adminSession, userController.blockUser)
router.post('/users/:userId/unblock', adminMiddleware.adminSession, userController.unblockUser);
router.get("/users/list", adminMiddleware.adminSession, userController.listUsers);

router.get('/brands', adminMiddleware.adminSession, brandCategoryController.getBrandsPage)
router.post('/brands/edit/:brandId', adminMiddleware.adminSession, brandCategoryController.editBrand)
router.post('/brands/delete/:brandId', adminMiddleware.adminSession, brandCategoryController.deleteBrand)
router.post('/brands/add', adminMiddleware.adminSession, brandCategoryController.addBrand)

router.get('/categories', adminMiddleware.adminSession, brandCategoryController.getCategoriesPage)
router.post('/categories/add', adminMiddleware.adminSession, brandCategoryController.addCategory);
router.post('/categories/edit/:id', adminMiddleware.adminSession, brandCategoryController.editCategory);
router.post('/categories/delete/:id', adminMiddleware.adminSession, brandCategoryController.deleteCategory);



router.get("/products", adminMiddleware.adminSession, productController.listProducts);
router.post("/products/add", adminMiddleware.adminSession, upload.none(), productController.postAddProduct);
router.post("/products/edit/:id", adminMiddleware.adminSession, upload.none(), productController.updateProduct);
router.post("/products/delete/:productId", adminMiddleware.adminSession, productController.deleteProduct);

router.get("/products/:productId/variants/json", adminMiddleware.adminSession, variantController.getVariantsByProduct);

router.post("/products/add-variant", adminMiddleware.adminSession, variantUpload.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "subImages", maxCount: 5 }
]), variantController.postAddVariant);

router.post("/products/variants/delete/:variantId", variantController.deleteVariant);
router.post("/products/variants/edit/:variantId", adminMiddleware.adminSession, variantUpload.fields([
  { name: "coverImage", maxCount: 1 },
  { name: "subImages", maxCount: 5 }
]), variantController.updateVariant);



router.post("/products/variants/status/:variantId", adminMiddleware.adminSession, variantController.toggleVariantStatus);

router.get("/offers", adminMiddleware.adminSession, offerController.getOffers);
router.get("/offers/stats", adminMiddleware.adminSession, offerController.getOfferStats);
router.post("/offers/add", adminMiddleware.adminSession, offerController.createOffer);
router.put("/offers/edit/:id", adminMiddleware.adminSession, offerController.updateOffer);
router.delete("/offers/delete/:id", adminMiddleware.adminSession, offerController.deleteOffer);



router.get('/coupons', adminMiddleware.adminSession, couponController.loadCoupons)
router.post('/coupons/add', adminMiddleware.adminSession, couponController.addCoupon)
router.put("/coupons/edit/:id", adminMiddleware.adminSession, couponController.editCoupon);
router.delete("/coupons/delete/:id", adminMiddleware.adminSession, couponController.deleteCoupon);


// Order Routes
router.get('/orders', adminMiddleware.adminSession, orderController.getAllOrders);
router.get('/orders/:id/details', adminMiddleware.adminSession, orderController.getOrderDetails);
router.put('/orders/:id/status', adminMiddleware.adminSession, orderController.updateOrderStatus);


// Return Management
router.get('/returns', adminMiddleware.adminSession, requestController.getReturnRequests);
router.post('/orders/:orderId/items/:itemId/return-action', adminMiddleware.adminSession, requestController.handleReturnAction);


export default router