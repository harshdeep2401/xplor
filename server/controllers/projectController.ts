import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { processFloorPlan } from '../services/aiService'
import { putObject, floorPlanKey } from '../services/storage'

const createProject = async (req: Request, res: Response) => {
  try {
    const { name, canvasWidth, canvasHeight, type } = req.body

    // User is authenticated by protect middleware
    const userId = req.user!.id

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
      message: (error as Error).message,
    })
  }
}

const getProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    })

    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    // Check ownership
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to access this project' })
    }

    const responseProject = { ...project, _id: project.id }

    res.status(200).json({ project: responseProject })
  } catch (error) {
    res.status(500).json({
      message: (error as Error).message,
    })
  }
}

const getProjects = async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.user!.id },
      orderBy: { updatedAt: 'desc' },
    })

    const responseProjects = projects.map(p => ({ ...p, _id: p.id }))

    res.status(200).json({ projects: responseProjects })
  } catch (error) {
    res.status(500).json({
      message: (error as Error).message,
    })
  }
}

const saveProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { canvas } = req.body

    // Verify the project exists and belongs to the caller before writing.
    // Without this check any authenticated user could overwrite any project.
    const existing = await prisma.project.findUnique({
      where: { id: req.params.id }
    })

    if (!existing) {
      return res.status(404).json({ message: 'Project not found' })
    }

    if (existing.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

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
    if ((error as Prisma.PrismaClientKnownRequestError).code === 'P2025') {
      return res.status(404).json({ message: 'Project not found' })
    }
    res.status(500).json({
      message: (error as Error).message,
    })
  }
}

const deleteProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id }
    })

    if (!project) {
      return res.status(404).json({ message: 'Project not found' })
    }

    // Check ownership
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to delete this project' })
    }

    await prisma.project.delete({
      where: { id: req.params.id }
    })

    res.status(200).json({ message: 'Project deleted successfully' })
  } catch (error) {
    res.status(500).json({
      message: (error as Error).message,
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
const uploadFloorPlan = async (req: Request<{ id: string }>, res: Response) => {
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

    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

    // Persist the buffered upload via the storage module and get its public URL.
    // Local disk today → R2/S3 later, without touching this controller.
    const floorPlanUrl = await putObject({
      key: floorPlanKey(req.user!.id, req.file.originalname),
      body: req.file.buffer,
      contentType: req.file.mimetype,
    })

    const updatedProject = await prisma.project.update({
      where: { id: project.id },
      data: { floorPlanUrl }
    })

    let job = await prisma.job.create({
      data: {
        userId: req.user!.id,
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

    // Call the AI service synchronously and fold the result into the job
    // before responding. See ai-service/README.md for why this is sync
    // rather than a queue/webhook at this stage.
    //
    // Errors here (AI service unreachable, bad detection, etc.) do NOT
    // fail this request — the upload itself already succeeded. They're
    // recorded on the job instead, and the client finds out by polling
    // GET /api/jobs/:id like it already does.
    try {
      job = await prisma.job.update({
        where: { id: job.id },
        data: { status: 'processing' },
      })

      const result = await processFloorPlan({
        jobId: job.id,
        projectId: project.id,
        floorPlanUrl,
      })

      if (result.status === 'completed') {
        await prisma.scene.create({
          data: {
            projectId: project.id,
            sceneData: result.detection,
            metadata: result.metadata,
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
      } else {
        job = await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorMessage: result.error || 'AI service reported failure',
          },
        })
      }
    } catch (aiError) {
      // Transport-level failure (service down, timeout, etc.) — same
      // handling as a reported "failed" result above.
      job = await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorMessage: (aiError as Error).message,
        },
      })
    }

    res.status(201).json({
      message: 'Floor plan uploaded, job created',
      project: responseProject,
      job,
    })
  } catch (error) {
    res.status(500).json({
      message: (error as Error).message,
    })
  }
}

export {
  createProject,
  getProject,
  getProjects,
  saveProject,
  deleteProject,
  uploadFloorPlan,
}
