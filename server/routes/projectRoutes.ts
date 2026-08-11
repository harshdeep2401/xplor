import express from 'express'
import {
  createProject,
  getProject,
  getProjects,
  saveProject,
  deleteProject,
  uploadFloorPlan,
} from '../controllers/projectController'
import { protect } from '../middleware/authMiddleware'
import { uploadFloorPlan as uploadFloorPlanMiddleware } from '../middleware/uploadMiddleware'

const router = express.Router()

router.use(protect)

router.post('/', createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', saveProject)
router.delete('/:id', deleteProject)
router.post('/:id/upload-floor-plan', uploadFloorPlanMiddleware.single('floorPlan'), uploadFloorPlan)

export default router
