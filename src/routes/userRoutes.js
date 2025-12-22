import express from "express";
const router = express.Router();
import authController from "../controllers/userControllers/authController.js";


router.get('/',authController.landingPage)
router.get('/signup', authController.getSignup)
router.post('/signup',authController.postSignup)
router.get('/login', authController.getLogin)
router.get('/forgot-password',authController.forgotPassword)
router.post('/forgot-password', authController.verifyEmail)
// router.get('/profile', authController.profile)

export default router