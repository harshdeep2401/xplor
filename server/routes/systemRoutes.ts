import express from 'express'
import { getSystemStatus } from '../controllers/systemController'
import { protect } from '../middleware/authMiddleware'

const router = express.Router()

router.use(protect)

router.get('/status', getSystemStatus)

export default router
