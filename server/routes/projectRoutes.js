const express = require('express')
const router = express.Router()

const {
  createProject,
  getProject,
  getProjects,
  saveProject,
  deleteProject,
  uploadFloorPlan,
} = require('../controllers/projectController')

const { protect } = require('../middleware/authMiddleware')
const { uploadFloorPlan: uploadFloorPlanMiddleware } = require('../middleware/uploadMiddleware')

router.use(protect)

router.post('/', createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', saveProject)
router.delete('/:id', deleteProject)
router.post('/:id/upload-floor-plan', uploadFloorPlanMiddleware.single('floorPlan'), uploadFloorPlan)

module.exports = router