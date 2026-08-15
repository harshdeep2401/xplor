import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { convertCanvasToScene, ConverterError } from '../services/converter'
import { putObject, glbKey, deleteObject, keyFromPublicUrl } from '../services/storage'

// How many most-recent GLB exports to keep per project (older ones are pruned).
const GLB_KEEP = Math.max(1, Number(process.env.GLB_KEEP) || 2)

// POST /api/projects/:id/convert
// Deterministic 2D→3D: read the project's stored canvas, convert it to a canonical
// scene-v1, and persist it as a new versioned Scene. Tracked as a Job (using the
// existing job-queue columns) so the client has a record to poll. Conversion is
// fast + CPU-only, so it runs inline rather than via the async worker.
export const convertProject = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

    const job = await prisma.job.create({
      data: {
        userId: req.user!.id,
        projectId: project.id,
        jobType: 'canvas_to_scene',
        status: 'processing',
        startedAt: new Date(),
        input: (project.canvas ?? {}) as Prisma.InputJsonValue,
      },
    })

    // Convert. canvas-v2 payloads carry their own scale/height; legacy canvases
    // fall back to the project's columns.
    let scene
    try {
      scene = convertCanvasToScene(project.canvas, {
        pixelsPerMetre: project.scalePixelsPerMeter,
        wallHeight: project.defaultWallHeightM,
      })
    } catch (err) {
      const message = err instanceof ConverterError ? err.message : (err as Error).message
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
          errorCode: 'CONVERSION_FAILED',
          errorMessage: message,
        },
      })
      return res.status(422).json({ message: `Conversion failed: ${message}`, jobId: job.id })
    }

    // New Scene version. Optimistic concurrency: next = max(version)+1; a
    // concurrent convert racing for the same version violates
    // @@unique([projectId, version]) → P2002 → 409.
    const latest = await prisma.scene.findFirst({
      where: { projectId: project.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latest?.version ?? 0) + 1

    let created
    try {
      created = await prisma.$transaction(async (tx) => {
        await tx.scene.updateMany({
          where: { projectId: project.id, isActive: true },
          data: { isActive: false },
        })
        return tx.scene.create({
          data: {
            projectId: project.id,
            version: nextVersion,
            sceneData: scene as unknown as Prisma.InputJsonValue,
            isActive: true,
            sourceJobId: job.id,
          },
        })
      })
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            errorCode: 'VERSION_CONFLICT',
            errorMessage: 'A concurrent conversion won the race for this version.',
          },
        })
        return res.status(409).json({
          message: 'Conversion conflict — another conversion updated this project. Retry.',
          jobId: job.id,
        })
      }
      throw err
    }

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        result: { sceneId: created.id, version: created.version } as Prisma.InputJsonValue,
      },
    })

    return res.status(201).json({
      message: 'Converted to 3D scene',
      job: { id: job.id, status: 'completed' },
      scene: { id: created.id, version: created.version, sceneData: scene },
    })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}

// PUT /api/projects/:id/scene → persist the 3D editor's scene into the active
// canonical Scene (superseding the legacy glTF-in-project.canvas save, which
// clobbered the 2D drawing). Body: { sceneData, baseVersion }. Optimistic
// concurrency: baseVersion must match the current active version, else 409.
export const saveScene = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const { sceneData, baseVersion } = req.body as {
      sceneData?: unknown
      baseVersion?: number
    }
    if (sceneData === undefined) {
      return res.status(400).json({ message: 'sceneData is required' })
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

    const active = await prisma.scene.findFirst({
      where: { projectId: req.params.id, isActive: true },
      orderBy: { version: 'desc' },
    })

    // No scene yet (e.g. legacy project never converted) → start at v1.
    if (!active) {
      const created = await prisma.scene.create({
        data: {
          projectId: req.params.id,
          version: 1,
          sceneData: sceneData as Prisma.InputJsonValue,
          isActive: true,
        },
      })
      return res.status(201).json({ scene: { id: created.id, version: created.version } })
    }

    if (typeof baseVersion === 'number' && baseVersion !== active.version) {
      return res.status(409).json({
        message: 'Scene changed since you loaded it — reload before saving.',
        currentVersion: active.version,
      })
    }

    try {
      const updated = await prisma.scene.update({
        where: { id: active.id },
        data: {
          sceneData: sceneData as Prisma.InputJsonValue,
          version: active.version + 1,
        },
      })
      return res.status(200).json({ scene: { id: updated.id, version: updated.version } })
    } catch (err) {
      if ((err as Prisma.PrismaClientKnownRequestError).code === 'P2002') {
        return res.status(409).json({
          message: 'Version conflict — reload before saving.',
          currentVersion: active.version,
        })
      }
      throw err
    }
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}

// POST /api/projects/:id/glb  (multipart field 'glb')
// Store an exported GLB as a derived VrOutput, then prune to the newest GLB_KEEP.
// The GLB is a large regenerable artifact — unlike scene JSON, we don't keep every
// version. Called automatically by the 3D editor on save.
export const storeGlb = async (req: Request<{ id: string }>, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No GLB uploaded. Expected field "glb".' })
    }

    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to modify this project' })
    }

    const url = await putObject({
      key: glbKey(req.params.id),
      body: req.file.buffer,
      contentType: 'model/gltf-binary',
    })

    await prisma.vrOutput.create({
      data: {
        projectId: req.params.id,
        outputUrl: url,
        format: 'glb',
        fileSizeMb: req.file.size / (1024 * 1024),
      },
    })

    // Prune: keep the newest GLB_KEEP, delete older rows + their stored objects.
    const glbs = await prisma.vrOutput.findMany({
      where: { projectId: req.params.id, format: 'glb' },
      orderBy: { createdAt: 'desc' },
    })
    for (const stale of glbs.slice(GLB_KEEP)) {
      const key = keyFromPublicUrl(stale.outputUrl)
      if (key) await deleteObject(key)
      await prisma.vrOutput.delete({ where: { id: stale.id } })
    }

    return res.status(201).json({ url, kept: Math.min(glbs.length, GLB_KEEP) })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}

// GET /api/projects/:id/glb → the latest stored GLB URL for this project.
export const getLatestGlb = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to access this project' })
    }

    const latest = await prisma.vrOutput.findFirst({
      where: { projectId: req.params.id, format: 'glb' },
      orderBy: { createdAt: 'desc' },
    })
    if (!latest) return res.status(404).json({ message: 'No GLB exported yet.' })

    return res.status(200).json({ url: latest.outputUrl, createdAt: latest.createdAt })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}

// GET /api/projects/:id/scene → the latest active scene-v1 for this project.
export const getActiveScene = async (req: Request<{ id: string }>, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    })
    if (!project) return res.status(404).json({ message: 'Project not found' })
    if (project.userId !== req.user!.id) {
      return res.status(401).json({ message: 'Not authorized to access this project' })
    }

    const scene = await prisma.scene.findFirst({
      where: { projectId: req.params.id, isActive: true },
      orderBy: { version: 'desc' },
    })
    if (!scene) {
      return res.status(404).json({ message: 'No scene yet — convert the 2D plan first.' })
    }

    return res.status(200).json({
      scene: { id: scene.id, version: scene.version, sceneData: scene.sceneData },
    })
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message })
  }
}
