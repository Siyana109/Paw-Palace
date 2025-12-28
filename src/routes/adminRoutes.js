import express from "express"
const router = express.Router()

import authController from "../controllers/adminControllers/authController.js"

router.get('/login', authController.getAdmin)
router.post('/login', authController.postAdmin)

export default router