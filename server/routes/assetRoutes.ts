import express from 'express'
import { listAssets } from '../controllers/assetController'
import { protect } from '../middleware/authMiddleware'

const router = express.Router()

router.use(protect)

router.get('/', listAssets)

export default router
