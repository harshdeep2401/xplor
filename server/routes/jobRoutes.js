const express = require('express')
const router = express.Router()

const { getJobs, getJob, updateJobStatus } = require('../controllers/jobController')
const { protect } = require('../middleware/authMiddleware')

router.use(protect)

router.get('/', getJobs)
router.get('/:id', getJob)
router.patch('/:id/status', updateJobStatus)

module.exports = router