const { prisma } = require('../config/db')

const createProject = async (req, res) => {
  try {
    const { name, canvasWidth, canvasHeight, type, userId } = req.body

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

    const responseProject = { ...project, _id: project.id }

    res.status(200).json({ project: responseProject })
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

module.exports = {
  createProject,
  getProject,
  saveProject,
}
