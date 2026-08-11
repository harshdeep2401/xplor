import express from 'express'
import { getJobs, getJob, updateJobStatus } from '../controllers/jobController'
import { protect } from '../middleware/authMiddleware'

const router = express.Router()

router.use(protect)

router.get('/', getJobs)
router.get('/:id', getJob)
router.patch('/:id/status', updateJobStatus)

export default router
