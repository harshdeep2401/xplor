const express = require('express')
const router = express.Router()

const {
  createProject,
  getProject,
  saveProject,
} = require('../controllers/projectController')

// Protect routes if necessary. For now, matching standard express routing.
router.post('/', createProject)
router.get('/:id', getProject)
router.put('/:id', saveProject)

module.exports = router
