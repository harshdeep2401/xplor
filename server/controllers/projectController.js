const { prisma } = require('../config/db')

const createProject = async (req, res) => {
  try {
    const { name, canvasWidth, canvasHeight, type } = req.body
    
    // User is authenticated by protect middleware
    const userId = req.user.id

    const project = await prisma.project.create({
      data: {
        name: name || 'Untitled Floor Plan',
        canvasWidth: canvasWidth || 2000,
        canvasHeight: canvasHeight || 2000,
        type: type || '2d',
        userId,
        canvas: { elements: [] },
      }
    })

    // Add _id to payload so frontend doesn't break
    const responseProject = { ...project, _id: project.id }

    res.status(201).json({
      message: 'Project created successfully',
      project: responseProject,
    })
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

const getProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    })
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    // Check ownership
    if (project.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to access this project' })
    }

    const responseProject = { ...project, _id: project.id }

    res.status(200).json({ project: responseProject })
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

const getProjects = async (req, res) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
    })

    const responseProjects = projects.map(p => ({ ...p, _id: p.id }))

    res.status(200).json({ projects: responseProjects })
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

const saveProject = async (req, res) => {
  try {
    const { canvas } = req.body
    
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { canvas }
    })

    const responseProject = { ...project, _id: project.id }

    res.status(200).json({
      message: 'Project saved successfully',
      project: responseProject,
    })
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ message: 'Project not found' })
    }
    res.status(500).json({
      message: error.message,
    })
  }
}

const deleteProject = async (req, res) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    })
    
    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    // Check ownership
    if (project.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to delete this project' })
    }

    await prisma.project.delete({
      where: { id: req.params.id }
    })

    res.status(200).json({ message: 'Project deleted successfully' })
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

// POST /api/projects/:id/upload-floor-plan
// multer (uploadMiddleware) has already written the file to disk by the
// time this runs and populated req.file. This handler just:
//   1. verifies the project exists and belongs to the caller
//   2. records where the file landed (floorPlanUrl)
//   3. creates a Job row (status: 'pending') that will later be picked up
//      and sent to the FastAPI AI service
const uploadFloorPlan = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded. Expected field name "floorPlan".' })
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    })

    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    if (project.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

    // Local-disk URL for now — served statically from /uploads (see server.js).
    // Once storage moves to S3/R2, this becomes the bucket URL instead.
    const floorPlanUrl = `/uploads/floor-plans/${req.user.id}/${req.file.filename}`

    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: { floorPlanUrl }
    })

    const job = await prisma.job.create({
      data: {
        userId: req.user.id,
        projectId: project.id,
        jobType: 'floor_plan_processing',
        status: 'pending',
        metadata: {
          floorPlanUrl,
          originalFilename: req.file.originalname,
          fileSizeBytes: req.file.size,
          mimeType: req.file.mimetype,
        },
      }
    })

    const responseProject = { ...updatedProject, _id: updatedProject.id }

    res.status(201).json({
      message: 'Floor plan uploaded, job created',
      project: responseProject,
      job,
    })
  } catch (error) {
    res.status(500).json({
      message: error.message,
    })
  }
}

module.exports = {
  createProject,
  getProject,
  getProjects,
  saveProject,
  deleteProject,
  uploadFloorPlan,
}
