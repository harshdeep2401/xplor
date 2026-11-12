import type { Request, Response } from 'express'
import { type Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { BadRequestError, ConflictError } from '../errors'
import { processFloorPlan } from '../services/aiService'
import { currentUserId, getOwnedProject } from '../services/access'
import { putObject, floorPlanKey } from '../services/storage'
import {
  detectionToCanvas,
  validateCanvasV2,
  validateDetectionV1,
  formatErrors,
} from '../services/converter'
import type { IdParams } from '../schemas/common'
import type { CreateProjectBody, SaveProjectBody } from '../schemas/projects'

// Bodies and ids are checked by schemas/ before these run; failures are thrown
// and answered by middleware/errorHandler.ts. Projects that belong to someone
// else are "not found" (services/access.ts).

// The client still reads `_id` (from the MongoDB days), so every project goes
// out with both.
const withLegacyId = <T extends { id: string }>(project: T) => ({ ...project, _id: project.id })

// POST /api/projects  Body: createProjectBody (name defaulted, sizes rounded)
const createProject = async (req: Request<object, unknown, CreateProjectBody>, res: Response) => {
  const { name, canvasWidth, canvasHeight, type } = req.body
  const project = await prisma.project.create({
    data: {
      name,
      canvasWidth: canvasWidth ?? 2000,
      canvasHeight: canvasHeight ?? 2000,
      type,
      userId: currentUserId(req),
      canvas: { elements: [] },
    },
  })
  res.status(201).json({ message: 'Project created successfully', project: withLegacyId(project) })
}

// GET /api/projects/:id
const getProject = async (req: Request<IdParams>, res: Response) => {
  const project = await getOwnedProject(req.params.id, currentUserId(req))
  res.status(200).json({ project: withLegacyId(project) })
}

// GET /api/projects  (newest first)
const getProjects = async (req: Request, res: Response) => {
  const projects = await prisma.project.findMany({
    where: { userId: currentUserId(req) },
    orderBy: { updatedAt: 'desc' },
  })
  res.status(200).json({ projects: projects.map(withLegacyId) })
}

// PUT /api/projects/:id  Body: { canvas } (canvas-v2, from the 2D editor)
const saveProject = async (req: Request<IdParams, unknown, SaveProjectBody>, res: Response) => {
  const existing = await getOwnedProject(req.params.id, currentUserId(req))
  const project = await prisma.project.update({
    where: { id: existing.id },
    data: { canvas: req.body.canvas as unknown as Prisma.InputJsonValue },
  })
  res.status(200).json({ message: 'Project saved successfully', project: withLegacyId(project) })
}

// DELETE /api/projects/:id
const deleteProject = async (req: Request<IdParams>, res: Response) => {
  const project = await getOwnedProject(req.params.id, currentUserId(req))
  await prisma.project.delete({ where: { id: project.id } })
  res.status(200).json({ message: 'Project deleted successfully' })
}

// POST /api/projects/:id/upload-floor-plan
// multer (uploadMiddleware) has buffered the file and populated req.file.
// This handler:
//   1. verifies the project belongs to the caller and is still empty
//   2. stores the image (floorPlanUrl) and creates a Job
//   3. calls the AI service; on success, validates the detection-v1 result and
//      bridges it to canvas-v2 in project.canvas (sized to the image, so the
//      2D editor can show the upload as a 1:1 trace layer)
const uploadFloorPlan = async (req: Request<IdParams>, res: Response) => {
  if (!req.file) {
    throw new BadRequestError('No file uploaded. Expected field name "floorPlan".', 'NO_FILE')
  }
  const userId = currentUserId(req)
  const project = await getOwnedProject(req.params.id, userId)

  // Detection replaces the whole canvas, so never run it over existing work.
  if (hasDrawing(project.canvas)) {
    throw new ConflictError(
      'Project already has a drawing. Import a floor plan into a new project instead.',
      'PROJECT_NOT_EMPTY',
    )
  }

  // Persist the buffered upload via the storage module and get its public URL.
  // Local disk today → R2/S3 later, without touching this controller.
  const floorPlanUrl = await putObject({
    key: floorPlanKey(userId, req.file.originalname),
    body: req.file.buffer,
    contentType: req.file.mimetype,
  })

  let updatedProject = await prisma.project.update({
    where: { id: project.id },
    data: { floorPlanUrl },
  })

  let job = await prisma.job.create({
    data: {
      userId,
      projectId: project.id,
      jobType: 'floor_plan_processing',
      status: 'pending',
      metadata: {
        floorPlanUrl,
        originalFilename: req.file.originalname,
        fileSizeBytes: req.file.size,
        mimeType: req.file.mimetype,
      },
    },
  })

  // Call the AI service synchronously and fold the result into the job
  // before responding. See ai-service/README.md for why this is sync
  // rather than a queue/webhook at this stage.
  //
  // Errors here (AI service unreachable, bad detection, etc.) do NOT
  // fail this request — the upload itself already succeeded. They're
  // recorded on the job instead, and the client reads them from the job.
  try {
    job = await prisma.job.update({ where: { id: job.id }, data: { status: 'processing' } })

    const result = await processFloorPlan({
      jobId: job.id,
      projectId: project.id,
      image: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
    })

    if (result.status !== 'completed') {
      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: result.error || 'AI service reported failure',
        },
      })
    } else {
      const detection = result.detection
      if (!validateDetectionV1(detection)) {
        throw new Error(
          `AI service returned invalid detection-v1: ${formatErrors(validateDetectionV1.errors)}`,
        )
      }
      const canvas = detectionToCanvas(detection, {
        pixelsPerMetre: project.scalePixelsPerMeter,
        wallHeight: project.defaultWallHeightM,
      })
      if (!validateCanvasV2(canvas)) {
        throw new Error(`Bridged canvas failed canvas-v2: ${formatErrors(validateCanvasV2.errors)}`)
      }

      updatedProject = await prisma.project.update({
        where: { id: project.id },
        data: {
          canvas: canvas as unknown as Prisma.InputJsonValue,
          // Image pixels map 1:1 to canvas pixels.
          ...(result.metadata?.imageWidth && result.metadata?.imageHeight
            ? { canvasWidth: result.metadata.imageWidth, canvasHeight: result.metadata.imageHeight }
            : {}),
        },
      })

      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          completedAt: new Date(),
          metadata: {
            ...((job.metadata as Record<string, unknown>) ?? {}),
            ...result.metadata,
          } as Prisma.InputJsonValue,
        },
      })
    }
  } catch (aiError) {
    // Transport-level failure (service down, timeout, etc.) or an invalid
    // detection — same handling as a reported "failed" result above.
    job = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: aiError instanceof Error ? aiError.message : String(aiError),
      },
    })
  }

  res.status(201).json({
    message: 'Floor plan uploaded, job created',
    project: withLegacyId(updatedProject),
    job,
  })
}

// True if a stored canvas (legacy {elements} or canvas-v2) has any content.
function hasDrawing(canvas: unknown): boolean {
  if (typeof canvas !== 'object' || canvas === null) return false
  const c = canvas as Record<string, unknown>
  return ['elements', 'walls', 'openings', 'labels'].some(
    (key) => Array.isArray(c[key]) && (c[key] as unknown[]).length > 0,
  )
}

export { createProject, getProject, getProjects, saveProject, deleteProject, uploadFloorPlan }
