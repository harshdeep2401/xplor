import fs from 'fs'
import path from 'path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { prisma } from '../../config/db'
import { env } from '../../config/env'
import type { FloorPlanResult } from '../../services/aiService'
import { api, createProject, errorOf, signUp, twoRoomCanvas } from './helpers'

// The AI service runs on another machine; here it's replaced per test.
const processFloorPlan = vi.fn<() => Promise<FloorPlanResult>>()
vi.mock('../../services/aiService', () => ({
  processFloorPlan: (...args: unknown[]) => processFloorPlan(...(args as [])),
  getAiStatus: async () => ({ reachable: false, error: 'not in tests' }),
}))

beforeEach(() => {
  processFloorPlan.mockReset()
})

// A tiny valid PNG header is enough: the server checks the type, not the pixels.
const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

describe('project CRUD', () => {
  test('create → list → get → save → delete', async () => {
    const user = await signUp()
    const created = await api()
      .post('/api/projects')
      .set(user.auth)
      .send({ name: '  Flat  ', canvasWidth: 1200, canvasHeight: 900 })
      .expect(201)
    const project = created.body.project
    expect(project).toMatchObject({ name: 'Flat', canvasWidth: 1200, type: '2d', userId: user.id })
    expect(project._id).toBe(project.id)

    const second = await createProject(user, { name: 'Second', type: '3d', canvasWidth: 7.5 })
    const list = await api().get('/api/projects').set(user.auth).expect(200)
    expect(list.body.projects.map((p: { id: string }) => p.id)).toEqual([second, project.id])
    expect(list.body.projects[0].canvasWidth).toBe(8)

    await api().get(`/api/projects/${project.id}`).set(user.auth).expect(200)

    const canvas = twoRoomCanvas()
    const saved = await api()
      .put(`/api/projects/${project.id}`)
      .set(user.auth)
      .send({ canvas })
      .expect(200)
    expect(saved.body.project.canvas).toEqual(canvas)

    await api().delete(`/api/projects/${project.id}`).set(user.auth).expect(200)
    const gone = await api().get(`/api/projects/${project.id}`).set(user.auth).expect(404)
    expect(errorOf(gone).code).toBe('PROJECT_NOT_FOUND')
  })

  test('defaults: untitled 2D project of 2000 × 2000 px', async () => {
    const user = await signUp()
    const res = await api().post('/api/projects').set(user.auth).send({}).expect(201)
    expect(res.body.project).toMatchObject({
      name: 'Untitled Floor Plan',
      type: '2d',
      canvasWidth: 2000,
      canvasHeight: 2000,
    })
  })

  test("someone else's project is not found — and is left untouched", async () => {
    const owner = await signUp('Owner')
    const other = await signUp('Other')
    const id = await createProject(owner)

    for (const [method, path] of [
      ['get', `/api/projects/${id}`],
      ['delete', `/api/projects/${id}`],
    ] as const) {
      const res = await api()[method](path).set(other.auth).expect(404)
      expect(errorOf(res).code).toBe('PROJECT_NOT_FOUND')
    }
    await api()
      .put(`/api/projects/${id}`)
      .set(other.auth)
      .send({ canvas: twoRoomCanvas() })
      .expect(404)

    const list = await api().get('/api/projects').set(other.auth).expect(200)
    expect(list.body.projects).toEqual([])
    expect(await prisma.project.findUnique({ where: { id } })).toMatchObject({ name: 'Plan' })
  })

  test('rejects bad input before touching the database', async () => {
    const user = await signUp()
    const id = await createProject(user)
    expect(errorOf(await api().get('/api/projects/bad%20id').set(user.auth).expect(400)).code).toBe(
      'VALIDATION_FAILED',
    )
    await api().post('/api/projects').set(user.auth).send({ type: 'vr' }).expect(400)
    await api().post('/api/projects').set(user.auth).send({ canvasWidth: -1 }).expect(400)
    const notV2 = await api()
      .put(`/api/projects/${id}`)
      .set(user.auth)
      .send({ canvas: { elements: [] } })
      .expect(400)
    expect(errorOf(notV2).message).toMatch(/^must be a valid canvas-v2/)
  })
})

describe('POST /api/projects/:id/upload-floor-plan', () => {
  const detection = {
    walls: [
      { id: 'w1', startX: 0, startY: 0, endX: 400, endY: 0, thickness: 10 },
      { id: 'w2', startX: 400, startY: 0, endX: 400, endY: 300, thickness: 10 },
    ],
    rooms: [],
    doors: [],
    windows: [],
  }

  test('stores the image and turns the detection into the 2D drawing', async () => {
    processFloorPlan.mockResolvedValueOnce({
      status: 'completed',
      detection,
      metadata: { imageWidth: 640, imageHeight: 480, wallCount: 2 },
    })
    const user = await signUp()
    const id = await createProject(user)

    const res = await api()
      .post(`/api/projects/${id}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', png, { filename: 'my plan.png', contentType: 'image/png' })
      .expect(201)

    expect(res.body.job).toMatchObject({ status: 'completed', jobType: 'floor_plan_processing' })
    expect(res.body.job.metadata).toMatchObject({ wallCount: 2, originalFilename: 'my plan.png' })
    const project = res.body.project
    expect(project).toMatchObject({ canvasWidth: 640, canvasHeight: 480 })
    expect(project.canvas.version).toBe('canvas-v2')
    expect(project.canvas.walls).toHaveLength(2)

    // The image is stored under UPLOAD_DIR and served back at its URL.
    expect(project.floorPlanUrl).toMatch(/^\/uploads\/floor-plans\/.+-my_plan\.png$/)
    const file = path.join(env.UPLOAD_DIR, project.floorPlanUrl.replace('/uploads/', ''))
    expect(fs.readFileSync(file)).toEqual(png)
    await api().get(project.floorPlanUrl).expect(200)
  })

  test('a failed detection is recorded on the job; the upload still succeeds', async () => {
    processFloorPlan.mockResolvedValueOnce({ status: 'failed', error: 'No walls found' })
    const user = await signUp()
    const id = await createProject(user)
    const res = await api()
      .post(`/api/projects/${id}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201)
    expect(res.body.job).toMatchObject({ status: 'failed', errorMessage: 'No walls found' })
  })

  test('an unreachable AI service or a bad detection fails the job, not the request', async () => {
    const user = await signUp()

    processFloorPlan.mockRejectedValueOnce(new Error('Could not reach the AI service'))
    const down = await api()
      .post(`/api/projects/${await createProject(user)}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201)
    expect(down.body.job.errorMessage).toBe('Could not reach the AI service')

    processFloorPlan.mockResolvedValueOnce({ status: 'completed', detection: { walls: 'nope' } })
    const bad = await api()
      .post(`/api/projects/${await createProject(user)}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201)
    expect(bad.body.job.status).toBe('failed')
    expect(bad.body.job.errorMessage).toMatch(/invalid detection-v1/)
  })

  test('refuses a project that already has a drawing, a wrong file type, or no file', async () => {
    const user = await signUp()
    const id = await createProject(user)
    await api()
      .put(`/api/projects/${id}`)
      .set(user.auth)
      .send({ canvas: twoRoomCanvas() })
      .expect(200)
    const busy = await api()
      .post(`/api/projects/${id}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(409)
    expect(errorOf(busy).code).toBe('PROJECT_NOT_EMPTY')

    const fresh = await createProject(user)
    const pdf = await api()
      .post(`/api/projects/${fresh}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', Buffer.from('%PDF'), {
        filename: 'p.pdf',
        contentType: 'application/pdf',
      })
      .expect(400)
    expect(errorOf(pdf).code).toBe('INVALID_FILE_TYPE')

    const disguised = await api()
      .post(`/api/projects/${fresh}/upload-floor-plan`)
      .set(user.auth)
      .attach('floorPlan', Buffer.from('<html><script>alert(1)</script>'), {
        filename: 'plan.png',
        contentType: 'image/png',
      })
      .expect(400)
    expect(errorOf(disguised).code).toBe('INVALID_FILE_CONTENT')

    const none = await api()
      .post(`/api/projects/${fresh}/upload-floor-plan`)
      .set(user.auth)
      .expect(400)
    expect(errorOf(none).code).toBe('NO_FILE')
    expect(processFloorPlan).not.toHaveBeenCalled()
  })
})

describe('jobs', () => {
  test('list with filters, get one, and move it through its lifecycle', async () => {
    processFloorPlan.mockResolvedValue({ status: 'failed', error: 'x' })
    const user = await signUp()
    const a = await createProject(user)
    const b = await createProject(user)
    for (const id of [a, b]) {
      await api()
        .post(`/api/projects/${id}/upload-floor-plan`)
        .set(user.auth)
        .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
        .expect(201)
    }

    const all = await api().get('/api/jobs').set(user.auth).expect(200)
    expect(all.body.jobs).toHaveLength(2)
    const forA = await api().get(`/api/jobs?projectId=${a}`).set(user.auth).expect(200)
    expect(forA.body.jobs).toHaveLength(1)
    const jobId = forA.body.jobs[0].id
    const failed = await api().get('/api/jobs?status=failed').set(user.auth).expect(200)
    expect(failed.body.jobs).toHaveLength(2)
    await api().get('/api/jobs?status=done').set(user.auth).expect(400)

    await api().get(`/api/jobs/${jobId}`).set(user.auth).expect(200)
    const updated = await api()
      .patch(`/api/jobs/${jobId}/status`)
      .set(user.auth)
      .send({ status: 'completed', metadata: { note: 'by hand' } })
      .expect(200)
    expect(updated.body.job).toMatchObject({ status: 'completed', durationMinutes: 0 })
    expect(updated.body.job.metadata).toMatchObject({ note: 'by hand', mimeType: 'image/png' })
    expect(updated.body.job.completedAt).toBeTruthy()

    await api()
      .patch(`/api/jobs/${jobId}/status`)
      .set(user.auth)
      .send({ status: 'processing', errorMessage: 'retrying' })
      .expect(200)
    await api().patch(`/api/jobs/${jobId}/status`).set(user.auth).send({ status: 'x' }).expect(400)
  })

  test("someone else's job is not found", async () => {
    processFloorPlan.mockResolvedValue({ status: 'failed', error: 'x' })
    const owner = await signUp()
    const other = await signUp()
    const id = await createProject(owner)
    await api()
      .post(`/api/projects/${id}/upload-floor-plan`)
      .set(owner.auth)
      .attach('floorPlan', png, { filename: 'p.png', contentType: 'image/png' })
      .expect(201)
    const jobId = (await prisma.job.findFirstOrThrow({ where: { projectId: id } })).id

    expect(errorOf(await api().get(`/api/jobs/${jobId}`).set(other.auth).expect(404)).code).toBe(
      'JOB_NOT_FOUND',
    )
    await api()
      .patch(`/api/jobs/${jobId}/status`)
      .set(other.auth)
      .send({ status: 'completed' })
      .expect(404)
    const theirs = await api().get('/api/jobs').set(other.auth).expect(200)
    expect(theirs.body.jobs).toEqual([])
  })
})
