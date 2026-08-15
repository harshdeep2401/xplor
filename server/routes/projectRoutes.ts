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
import { uploadFloorPlan as uploadFloorPlanMiddleware, uploadGlb } from '../middleware/uploadMiddleware'
import {
  convertProject,
  getActiveScene,
  saveScene,
  storeGlb,
  getLatestGlb,
} from '../controllers/conversionController'

const router = express.Router()

router.use(protect)

router.post('/', createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', saveProject)
router.delete('/:id', deleteProject)
router.post('/:id/upload-floor-plan', uploadFloorPlanMiddleware.single('floorPlan'), uploadFloorPlan)
router.post('/:id/convert', convertProject)
router.get('/:id/scene', getActiveScene)
router.put('/:id/scene', saveScene)
router.post('/:id/glb', uploadGlb.single('glb'), storeGlb)
router.get('/:id/glb', getLatestGlb)

export default router
