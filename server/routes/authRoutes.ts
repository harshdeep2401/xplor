import express from 'express'
import {
  registerUser,
  googleLogin,
  loginUser,
} from '../controllers/authController'

const router = express.Router()

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/google-login', googleLogin)

export default router
