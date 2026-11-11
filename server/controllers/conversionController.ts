import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { prisma } from '../config/db'
import { env } from '../config/env'
import { BadRequestError, ConflictError, NotFoundError, UnprocessableError } from '../errors'
import { assertOwnsProject, currentUserId, getOwnedProject } from '../services/access'
import {
  convertCanvasToScene,
  carryOverEditorContent,
  assignAssetRooms,
  type SceneV1,
} from '../services/converter'
import {
  putObject,
  glbKey,
  projectFileKey,
  deleteObject,
  keyFromPublicUrl,
} from '../services/storage'
import type { IdParams } from '../schemas/common'
import type { SaveSceneBody } from '../schemas/projects'

// Ids and bodies are checked by schemas/ before these run; failures are thrown
// and answered by middleware/errorHandler.ts.

// How many most-recent GLB exports to keep per project (older ones are pruned).
const GLB_KEEP = env.GLB_KEEP

const isUniqueClash = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

// POST /api/projects/:id/convert
// Deterministic 2D→3D: read the project's stored canvas, convert it to a canonical
// scene-v1, and persist it as a new versioned Scene. Tracked as a Job (using the
// existing job-queue columns) so the client has a record to poll. Conversion is
// fast + CPU-only, so it runs inline rather than via the async worker.
export const convertProject = async (req: Request<IdParams>, res: Response) => {
  const userId = currentUserId(req)
  const project = await getOwnedProject(req.params.id, userId)

  const job = await prisma.job.create({
    data: {
      userId,
      projectId: project.id,
      jobType: 'canvas_to_scene',
      status: 'processing',
      startedAt: new Date(),
      input: (project.canvas ?? {}) as Prisma.InputJsonValue,
    },
  })
  const failJob = (errorCode: string, errorMessage: string) =>
    prisma.job.update({
      where: { id: job.id },
      data: { status: 'failed', completedAt: new Date(), errorCode, errorMessage },
    })

  // Convert. canvas-v2 payloads carry their own scale/height; legacy canvases
  // fall back to the project's columns.
  let scene: SceneV1
  try {
    scene = convertCanvasToScene(project.canvas, {
      pixelsPerMetre: project.scalePixelsPerMeter,
      wallHeight: project.defaultWallHeightM,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await failJob('CONVERSION_FAILED', message)
    throw new UnprocessableError(`Conversion failed: ${message}`, 'CONVERSION_FAILED', {
      jobId: job.id,
    })
  }

  // Keep the furniture, asset materials and lights the user added in 3D: they
  // are carried over from the scene this conversion replaces.
  const previous = await prisma.scene.findFirst({
    where: { projectId: project.id, isActive: true },
    orderBy: { version: 'desc' },
    select: { sceneData: true, metadata: true },
  })
  scene = carryOverEditorContent(previous?.sceneData, scene)

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
          ...(previous?.metadata ? { metadata: previous.metadata as Prisma.InputJsonValue } : {}),
          isActive: true,
          sourceJobId: job.id,
        },
      })
    })
  } catch (err) {
    if (!isUniqueClash(err)) throw err
    await failJob('VERSION_CONFLICT', 'A concurrent conversion won the race for this version.')
    throw new ConflictError(
      'Conversion conflict — another conversion updated this project. Retry.',
      'SCENE_VERSION_CONFLICT',
      { jobId: job.id },
    )
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

  res.status(201).json({
    message: 'Converted to 3D scene',
    job: { id: job.id, status: 'completed' },
    scene: { id: created.id, version: created.version, sceneData: scene },
  })
}

// PUT /api/projects/:id/scene → save the 3D editor's scene into the active
// canonical Scene, bumping its version. Body: { sceneData, metadata?, baseVersion }.
// sceneData must be a valid scene-v1 (walls/rooms as converted, plus the editor's
// assets, lights and materials); the server sets each asset's roomId. metadata
// holds editor-only settings (e.g. the grid size of a plan-less 3D project).
// Optimistic concurrency: baseVersion must match the current active version, else 409.
export const saveScene = async (req: Request<IdParams, unknown, SaveSceneBody>, res: Response) => {
  const { sceneData: rawScene, metadata, baseVersion } = req.body
  const projectId = req.params.id
  await assertOwnsProject(projectId, currentUserId(req))

  const sceneData = assignAssetRooms(rawScene)
  const metadataField = metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}
  const versionConflict = (currentVersion: number) =>
    new ConflictError(
      'Scene changed since you loaded it — reload before saving.',
      'SCENE_VERSION_CONFLICT',
      { currentVersion },
    )

  const active = await prisma.scene.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: 'desc' },
  })

  // No scene yet (e.g. legacy project never converted) → start at v1.
  if (!active) {
    const created = await prisma.scene.create({
      data: {
        projectId,
        version: 1,
        sceneData: sceneData as unknown as Prisma.InputJsonValue,
        ...metadataField,
        isActive: true,
      },
    })
    res.status(201).json({ scene: { id: created.id, version: created.version } })
    return
  }

  if (baseVersion !== undefined && baseVersion !== active.version) {
    throw versionConflict(active.version)
  }

  try {
    const updated = await prisma.scene.update({
      where: { id: active.id },
      data: {
        sceneData: sceneData as unknown as Prisma.InputJsonValue,
        ...metadataField,
        version: active.version + 1,
      },
    })
    res.status(200).json({ scene: { id: updated.id, version: updated.version } })
  } catch (err) {
    if (isUniqueClash(err)) throw versionConflict(active.version)
    throw err
  }
}

// POST /api/projects/:id/glb  (multipart field 'glb')
// Store an exported GLB as a derived VrOutput, then prune to the newest GLB_KEEP.
// The GLB is a large regenerable artifact — unlike scene JSON, we don't keep every
// version. Called automatically by the 3D editor on save.
export const storeGlb = async (req: Request<IdParams>, res: Response) => {
  if (!req.file) throw new BadRequestError('No GLB uploaded. Expected field "glb".', 'NO_FILE')
  const projectId = req.params.id
  await assertOwnsProject(projectId, currentUserId(req))

  const url = await putObject({
    key: glbKey(projectId),
    body: req.file.buffer,
    contentType: 'model/gltf-binary',
  })

  await prisma.vrOutput.create({
    data: {
      projectId,
      outputUrl: url,
      format: 'glb',
      fileSizeMb: req.file.size / (1024 * 1024),
    },
  })

  // Prune: keep the newest GLB_KEEP, delete older rows + their stored objects.
  const glbs = await prisma.vrOutput.findMany({
    where: { projectId, format: 'glb' },
    orderBy: { createdAt: 'desc' },
  })
  for (const stale of glbs.slice(GLB_KEEP)) {
    const key = keyFromPublicUrl(stale.outputUrl)
    if (key) await deleteObject(key)
    await prisma.vrOutput.delete({ where: { id: stale.id } })
  }

  res.status(201).json({ url, kept: Math.min(glbs.length, GLB_KEEP) })
}

// GET /api/projects/:id/glb → the latest stored GLB URL for this project.
export const getLatestGlb = async (req: Request<IdParams>, res: Response) => {
  const projectId = req.params.id
  await assertOwnsProject(projectId, currentUserId(req))

  const latest = await prisma.vrOutput.findFirst({
    where: { projectId, format: 'glb' },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest) throw new NotFoundError('No GLB exported yet.', 'GLB_NOT_FOUND')

  res.status(200).json({ url: latest.outputUrl, createdAt: latest.createdAt })
}

// GET /api/projects/:id/scene → the latest active scene-v1 for this project.
// 404 SCENE_NOT_FOUND (not an error for the editor) when nothing is converted yet.
export const getActiveScene = async (req: Request<IdParams>, res: Response) => {
  const projectId = req.params.id
  await assertOwnsProject(projectId, currentUserId(req))

  const scene = await prisma.scene.findFirst({
    where: { projectId, isActive: true },
    orderBy: { version: 'desc' },
  })
  if (!scene) {
    throw new NotFoundError('No scene yet — convert the 2D plan first.', 'SCENE_NOT_FOUND')
  }

  res.status(200).json({
    scene: {
      id: scene.id,
      version: scene.version,
      sceneData: scene.sceneData,
      metadata: scene.metadata,
    },
  })
}

// POST /api/projects/:id/files  (multipart field 'file')
// Store a GLB model or texture image the 3D editor imported from the user's disk,
// so the saved scene can refer to it by URL and reload it later.
export const uploadProjectFile = async (req: Request<IdParams>, res: Response) => {
  if (!req.file) throw new BadRequestError('No file uploaded. Expected field "file".', 'NO_FILE')
  const projectId = req.params.id
  await assertOwnsProject(projectId, currentUserId(req))

  const url = await putObject({
    key: projectFileKey(projectId, req.file.originalname),
    body: req.file.buffer,
    contentType: req.file.mimetype,
  })
  res.status(201).json({ url })
}
