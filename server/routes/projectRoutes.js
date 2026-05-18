const express = require('express')
const router = express.Router()

const {
  createProject,
  getProject,
  getProjects,
  saveProject,
  deleteProject,
} = require('../controllers/projectController')

const { protect } = require('../middleware/authMiddleware')

router.use(protect)

router.post('/', createProject)
router.get('/', getProjects)
router.get('/:id', getProject)
router.put('/:id', saveProject)
router.delete('/:id', deleteProject)

module.exports = router
