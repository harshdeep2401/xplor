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
  checkFileContent,
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

import { validate } from '../middleware/validate'
import { detectionLimiter, uploadLimiter } from '../middleware/security'
import { idParams } from '../schemas/common'
import {
  createProjectBody,
  saveProjectBody,
  saveSceneBody,
  suggestionsBody,
} from '../schemas/projects'

const router = express.Router()

router.use(protect)
// Every route with :id gets its project id checked first.
router.param('id', validate({ params: idParams }))

router.post('/', validate({ body: createProjectBody }), createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', validate({ body: saveProjectBody }), saveProject)
router.delete('/:id', deleteProject)
router.post(
  '/:id/upload-floor-plan',
  detectionLimiter,
  uploadFloorPlanMiddleware.single('floorPlan'),
  checkFileContent,
  uploadFloorPlan,
)
router.post('/:id/convert', convertProject)
router.get('/:id/scene', getActiveScene)
router.put('/:id/scene', validate({ body: saveSceneBody }), saveScene)
router.post('/:id/glb', uploadLimiter, uploadGlb.single('glb'), checkFileContent, storeGlb)
router.get('/:id/glb', getLatestGlb)
router.post(
  '/:id/files',
  uploadLimiter,
  uploadProjectFileMiddleware.single('file'),
  checkFileContent,
  uploadProjectFile,
)
router.post('/:id/suggestions', validate({ body: suggestionsBody }), suggestFurniture)

export default router
