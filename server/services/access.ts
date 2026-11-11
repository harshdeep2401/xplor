import type { Request } from 'express'
import { prisma } from '../config/db'
import { NotFoundError, UnauthorizedError } from '../errors'

// Who is asking. Routes behind `protect` always have a user; this turns a
// missing one (a route wired without `protect`) into a 401 instead of a crash.
export function currentUserId(req: Pick<Request, 'user'>): string {
  if (!req.user) throw new UnauthorizedError()
  return req.user.id
}

// The caller's project, or 404. Someone else's project is "not found" too, so
// ids belonging to other users are never confirmed. One query either way.
export async function getOwnedProject(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND')
  return project
}

// Same check when only ownership matters (the handler doesn't need the row).
export async function assertOwnsProject(projectId: string, userId: string): Promise<void> {
  const found = await prisma.project.count({ where: { id: projectId, userId } })
  if (!found) throw new NotFoundError('Project not found.', 'PROJECT_NOT_FOUND')
}

// The caller's job, or 404 (same rule as projects).
export async function getOwnedJob(jobId: string, userId: string) {
  const job = await prisma.job.findFirst({ where: { id: jobId, userId } })
  if (!job) throw new NotFoundError('Job not found.', 'JOB_NOT_FOUND')
  return job
}
