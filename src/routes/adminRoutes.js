import express from "express"
const router = express.Router()

import adminMiddleware from "../middlewares/adminMiddleware.js"

import authController from "../controllers/adminControllers/authController.js"
import userController from "../controllers/adminControllers/userController.js"

router.get('/login', adminMiddleware.isAdminLoggedIn, authController.getAdmin)
router.post('/login', authController.postAdmin)

router.get('/users', adminMiddleware.adminSession, userController.getUsers)
router.post('/users/:userId/block', adminMiddleware.adminSession, userController.blockUser)
router.post('/users/:userId/unblock', adminMiddleware.adminSession, userController.unblockUser);

router.get("/users/search", adminMiddleware.adminSession, userController.searchUsers);

export default router