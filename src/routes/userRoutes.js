import express from "express";
const router = express.Router();
import authController from "../controllers/userControllers/authController.js";
import userMiddleware from "../middlewares/userMiddleware.js"



router.get('/',authController.landingPage)
router.get('/signup', authController.getSignup)
router.post('/signup',authController.postSignup)
router.get('/login', authController.getLogin)
router.post('/login',authController.postLogin)
router.get('/forgot-password',authController.forgotPassword)
router.post('/forgot-password', authController.verifyEmail)
router.get('/home', authController.homePage)
// router.get('/profile', authController.profile)

export default router