const { prisma } = require('../config/db')

// GET /api/jobs?projectId=&status=
const getJobs = async (req, res) => {
  try {
    const { projectId, status } = req.query

    const where = { userId: req.user.id }
    if (projectId) where.projectId = projectId
    if (status) where.status = status

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    res.status(200).json({ jobs })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// GET /api/jobs/:id
// Frontend polls this to know when AI processing is done.
const getJob = async (req, res) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id }
    })

    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    if (job.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to view this job' })
    }

    res.status(200).json({ job })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

// PATCH /api/jobs/:id/status
// Body: { status: 'pending' | 'processing' | 'completed' | 'failed', errorMessage?, metadata? }
// This is the endpoint that will be called once the FastAPI call is wired up (either directly by the Node process that made the call, or later by a BullMQ worker). For now it moves a job through its lifecycle by hand while testing the upload flow end-to-end.
const updateJobStatus = async (req, res) => {
  try {
    const { status, errorMessage, metadata } = req.body

    const validStatuses = ['pending', 'processing', 'completed', 'failed']
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ message: `status must be one of: ${validStatuses.join(', ')}` })
    }

    const job = await prisma.job.findUnique({ where: { id: req.params.id } })

    if (!job) {
      return res.status(404).json({ message: 'Job not found' })
    }

    if (job.userId !== req.user.id) {
      return res.status(401).json({ message: 'Not authorized to modify this job' })
    }

    const data = { status }
    if (errorMessage !== undefined) data.errorMessage = errorMessage
    if (metadata !== undefined) data.metadata = { ...(job.metadata || {}), ...metadata }
    if (status === 'completed' || status === 'failed') {
      data.completedAt = new Date()
      if (job.startedAt) {
        data.durationMinutes = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000)
      }
    }

    const updatedJob = await prisma.job.update({
      where: { id: job.id },
      data,
    })

    res.status(200).json({ message: 'Job updated', job: updatedJob })
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

module.exports = {
  getJobs,
  getJob,
  updateJobStatus,
}