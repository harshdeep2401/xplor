import type { Request, Response } from 'express'
import { type Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { currentUserId, getOwnedJob } from '../services/access'
import type { IdParams } from '../schemas/common'
import type { JobsQuery, UpdateJobStatusBody } from '../schemas/jobs'

// GET /api/jobs?projectId=&status=
const getJobs = async (req: Request<object, unknown, unknown, JobsQuery>, res: Response) => {
  const { projectId, status } = req.query

  const where: Prisma.JobWhereInput = { userId: currentUserId(req) }
  if (projectId) where.projectId = projectId
  if (status) where.status = status

  const jobs = await prisma.job.findMany({ where, orderBy: { createdAt: 'desc' } })
  res.status(200).json({ jobs })
}

// GET /api/jobs/:id
// Frontend polls this to know when AI processing is done.
const getJob = async (req: Request<IdParams>, res: Response) => {
  const job = await getOwnedJob(req.params.id, currentUserId(req))
  res.status(200).json({ job })
}

// PATCH /api/jobs/:id/status
// Body: { status: 'pending' | 'processing' | 'completed' | 'failed', errorMessage?, metadata? }
// Moves a job through its lifecycle by hand (testing the upload flow end to end);
// a queue worker would call the same thing.
const updateJobStatus = async (
  req: Request<IdParams, unknown, UpdateJobStatusBody>,
  res: Response,
) => {
  const { status, errorMessage, metadata } = req.body
  const job = await getOwnedJob(req.params.id, currentUserId(req))

  const data: Prisma.JobUpdateInput = { status }
  if (errorMessage !== undefined) data.errorMessage = errorMessage
  if (metadata !== undefined) {
    data.metadata = {
      ...((job.metadata as Record<string, unknown>) ?? {}),
      ...metadata,
    } as Prisma.InputJsonValue
  }
  if (status === 'completed' || status === 'failed') {
    data.completedAt = new Date()
    if (job.startedAt) {
      data.durationMinutes = Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000)
    }
  }

  const updatedJob = await prisma.job.update({ where: { id: job.id }, data })
  res.status(200).json({ message: 'Job updated', job: updatedJob })
}

export { getJobs, getJob, updateJobStatus }
