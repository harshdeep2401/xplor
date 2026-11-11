import express from 'express'
import { registerUser, googleLogin, loginUser } from '../controllers/authController'

import { validate } from '../middleware/validate'
import { googleLoginBody, loginBody, registerBody } from '../schemas/auth'

const router = express.Router()

router.post('/register', validate({ body: registerBody }), registerUser)
router.post('/login', validate({ body: loginBody }), loginUser)
router.post('/google-login', validate({ body: googleLoginBody }), googleLogin)

export default router
