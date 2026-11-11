import express from 'express'
import { getJobs, getJob, updateJobStatus } from '../controllers/jobController'
import { protect } from '../middleware/authMiddleware'

import { validate } from '../middleware/validate'
import { idParams } from '../schemas/common'
import { jobsQuery, updateJobStatusBody } from '../schemas/jobs'

const router = express.Router()

router.use(protect)

router.get('/', validate({ query: jobsQuery }), getJobs)
router.get('/:id', validate({ params: idParams }), getJob)
router.patch(
  '/:id/status',
  validate({ params: idParams, body: updateJobStatusBody }),
  updateJobStatus,
)

export default router
