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
import {
  uploadFloorPlan as uploadFloorPlanMiddleware,
  uploadGlb,
  uploadProjectFile as uploadProjectFileMiddleware,
} from '../middleware/uploadMiddleware'
import {
  convertProject,
  getActiveScene,
  saveScene,
  storeGlb,
  getLatestGlb,
  uploadProjectFile,
} from '../controllers/conversionController'
import { suggestFurniture } from '../controllers/suggestionController'

const router = express.Router()

router.use(protect)

router.post('/', createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', saveProject)
router.delete('/:id', deleteProject)
router.post(
  '/:id/upload-floor-plan',
  uploadFloorPlanMiddleware.single('floorPlan'),
  uploadFloorPlan,
)
router.post('/:id/convert', convertProject)
router.get('/:id/scene', getActiveScene)
router.put('/:id/scene', saveScene)
router.post('/:id/glb', uploadGlb.single('glb'), storeGlb)
router.get('/:id/glb', getLatestGlb)
router.post('/:id/files', uploadProjectFileMiddleware.single('file'), uploadProjectFile)
router.post('/:id/suggestions', suggestFurniture)

export default router
