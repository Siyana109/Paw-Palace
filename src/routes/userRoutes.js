import express from "express";
const router = express.Router();
import authController from "../controllers/userControllers/authController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import profileController from "../controllers/userControllers/profileController.js";


router.get('/',authController.landingPage)

router.get('/home', authController.homePage)

router.get('/signup', authController.getSignup)
router.post('/signup', authController.postSignup)

router.get('/verify-otp', userMiddleware.isLoggedIn, authController.getVerifyOtp);
router.post('/verify-otp', userMiddleware.isLoggedIn, authController.verifyOtp)
router.post("/resend-otp", userMiddleware.isLoggedIn, authController.resendOtp);

router.get('/google', authController.googleSignup)
router.get("/google/callback", authController.googleCallback)

router.get('/login', userMiddleware.isLoggedIn, authController.getLogin)
router.post('/login', userMiddleware.isLoggedIn,authController.postLogin)

router.get('/forgot-password', authController.forgotPassword)
router.post('/forgot-password', authController.verifyEmailSendOtp)
router.get("/reset-password/verify-otp", authController.getResetOtp)
router.post("/reset-password/verify-otp", authController.verifyResetOtp)
router.get("/reset-password", authController.getResetPassword)
router.post("/reset-password", authController.resetPassword)

router.get('/profile', profileController.getProfile)
router.get('/profile/update', profileController.updateProfile)
router.get('/profile/address/add', profileController.getAddAddress);
router.post('/address/add', profileController.addAddress);
router.get('/profile/address/:id/edit', profileController.getEditAddress);
router.post('/profile/address/:id/edit', profileController.updateAddress);
router.post('/profile/address/:id/delete', profileController.deleteAddress);

// router.get('/address/add', profileController.getAddAddress)

export default router