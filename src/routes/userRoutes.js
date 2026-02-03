import express from "express";
const router = express.Router();
import authController from "../controllers/userControllers/authController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import profileController from "../controllers/userControllers/profileController.js";
import homeController from "../controllers/userControllers/homeController.js";
import productController from "../controllers/userControllers/productController.js";
import checkoutController from "../controllers/userControllers/checkoutController.js";
import { upload } from "../middlewares/upload.js";

router.get('/', authController.landingPage)

router.get('/signup', authController.getSignup)
router.post('/signup', authController.postSignup)

router.get('/verify-otp', userMiddleware.isLoggedIn, authController.getVerifyOtp);
router.post('/verify-otp', userMiddleware.isLoggedIn, authController.verifyOtp)
router.post("/resend-otp", userMiddleware.isLoggedIn, authController.resendOtp);

router.get('/google', authController.googleSignup)
router.get("/google/callback", authController.googleCallback)

router.get('/login', userMiddleware.isLoggedIn, authController.getLogin)
router.post('/login', userMiddleware.isLoggedIn, authController.postLogin)

router.get('/forgot-password', authController.forgotPassword)
router.post('/forgot-password', authController.verifyEmailSendOtp)
router.get("/reset-password/verify-otp", authController.getResetOtp)
router.post('/reset-password/resend-otp', authController.resendResetOtp);
router.post("/reset-password/verify-otp", authController.verifyResetOtp)
router.get("/reset-password", authController.getResetPassword)
router.post("/reset-password", authController.resetPassword)

router.get('/profile', userMiddleware.checkSession, profileController.getProfile)
router.post('/profile/update', userMiddleware.checkSession, profileController.updateProfile)
// router.get('/profile/address/add', userMiddleware.checkSession, profileController.getAddAddress);
router.post('/address/add', userMiddleware.checkSession, profileController.addAddress);
// router.get('/profile/address/:id/edit', userMiddleware.checkSession, profileController.getEditAddress);
router.put('/profile/address/:id/edit', userMiddleware.checkSession, profileController.editAddress);
router.post('/profile/address/:id/delete', userMiddleware.checkSession, profileController.deleteAddress);

router.post('/profile/image/update', userMiddleware.checkSession, upload.single('profilePic'), profileController.updateProfileImage)
router.post('/profile/image/remove', userMiddleware.checkSession, profileController.removeProfilePic);

router.get('/change-password', userMiddleware.checkSession, profileController.getChangePassword);
router.post('/change-password', userMiddleware.checkSession, profileController.postChangePassword);

router.get('/change-email', userMiddleware.checkSession, profileController.getChangeEmail);
router.post('/change-email', userMiddleware.checkSession, profileController.postChangeEmail);
router.get('/verify-email-otp', userMiddleware.checkSession, profileController.getVerifyEmailOtp);
router.post('/reset-email/verify-otp', userMiddleware.checkSession, userMiddleware.checkSession, profileController.verifyEmailOtp);
router.post('/reset-email/resend-otp', userMiddleware.checkSession, profileController.resendEmailOtp);

router.get("/home", homeController.homePage);
router.get('/product/:id', productController.getProductDetails);


router.get('/cart', userMiddleware.checkSession, productController.getCartPage);
router.post('/cart/add', userMiddleware.checkSession, productController.addToCart);
router.patch('/cart/update', userMiddleware.checkSession, productController.updateCartQuantity);
router.delete('/cart/remove', userMiddleware.checkSession, productController.removeCartItem);

router.get('/checkout', userMiddleware.checkSession, checkoutController.getCheckoutPage);
router.get('/order-confirmation', userMiddleware.checkSession, checkoutController.getOrderConfirmationPage);
router.get('/order-confirmation/:id', userMiddleware.checkSession, checkoutController.getOrderConfirmationPage);

router.post('/wishlist/add', userMiddleware.checkSession, productController.addToWishlist);
router.get('/wishlist', userMiddleware.checkSession, productController.getWishlist);
router.delete('/wishlist/remove', userMiddleware.checkSession, productController.removeFromWishlist);

router.post('/logout', userMiddleware.checkSession, authController.logout)

export default router