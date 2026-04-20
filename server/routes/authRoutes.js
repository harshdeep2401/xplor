const express = require('express')
const router = express.Router()

const {
  registerUser,
  googleLogin,
  loginUser,
} = require('../controllers/authController')

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/google-login', googleLogin)

module.exports = router