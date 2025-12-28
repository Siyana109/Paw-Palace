import express from "express";
const router = express.Router();
import authController from "../controllers/userControllers/authController.js";
import userMiddleware from "../middlewares/userMiddleware.js"
import profileController from "../controllers/userControllers/profileController.js";


router.get('/',authController.landingPage)

router.get('/home', authController.homePage)

router.get('/signup', userMiddleware.isLogin, authController.getSignup)
router.post('/signup', userMiddleware.isLogin,authController.postSignup)

router.get('/google', authController.googleSignup)
router.get("/google/callback", authController.googleCallback)

router.get('/verify-otp', userMiddleware.isLogin, authController.getVerifyOtp);
router.post('/verify-otp', userMiddleware.isLogin, authController.verifyOtp)
router.post("/resend-otp", userMiddleware.isLogin, authController.resendOtp);

router.get('/login', userMiddleware.isLogin, authController.getLogin)
router.post('/login', userMiddleware.isLogin,authController.postLogin)

// router.get('/forgot-password',authController.forgotPassword)
// router.post('/forgot-password', authController.verifyEmail)

router.get('/profile', profileController.getProfile)
router.post('/profile/update', profileController.updateProfile)

export default router