import { z } from 'zod'
import { id, jsonObject } from './common'

export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const

export const jobsQuery = z.object({
  projectId: id.optional(),
  status: z.enum(JOB_STATUSES).optional(),
})
export type JobsQuery = z.infer<typeof jobsQuery>

export const updateJobStatusBody = z.object({
  status: z.enum(JOB_STATUSES, { error: `status must be one of: ${JOB_STATUSES.join(', ')}` }),
  errorMessage: z.string().max(2000).optional(),
  metadata: jsonObject.optional(),
})
export type UpdateJobStatusBody = z.infer<typeof updateJobStatusBody>
