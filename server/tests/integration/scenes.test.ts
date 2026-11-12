import fs from 'fs'
import path from 'path'
import { describe, expect, test } from 'vitest'
import { prisma } from '../../config/db'
import { env } from '../../config/env'
import type { SceneV1 } from '../../services/converter'
import { api, convertedProject, createProject, errorOf, signUp, twoRoomCanvas } from './helpers'

// The first bytes of a real PNG: uploads are checked by content, not just name.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')

// A sofa placed in the living room (absolute scene-v1 coordinates, metres).
function withSofa(scene: SceneV1, x = 2.5, z = 2): SceneV1 {
  return {
    ...scene,
    assets: [
      {
        id: 'sofa-1',
        name: 'Sofa',
        kind: 'model',
        source: '/static/furniture/models/loungeSofa.glb',
        catalogId: 'kenney-loungeSofa',
        baseSize: { x: 2, y: 0.8, z: 0.9 },
        transform: {
          position: { x, y: 0, z },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    ],
  }
}

describe('POST /api/projects/:id/convert', () => {
  test('turns the 2D plan into a scene-v1 with typed rooms, tracked as a job', async () => {
    const user = await signUp()
    const { projectId, scene, version } = await convertedProject(user)

    expect(version).toBe(1)
    expect(scene.walls).toHaveLength(7)
    expect(scene.rooms?.map((r) => [r.name, r.type]).sort()).toEqual([
      ['Bedroom', 'bedroom'],
      ['Living room', 'living'],
    ])

    const job = await prisma.job.findFirstOrThrow({ where: { projectId } })
    expect(job).toMatchObject({ jobType: 'canvas_to_scene', status: 'completed', progress: 100 })
    expect(job.result).toMatchObject({ version: 1 })
  })

  test('converting again keeps the furniture added in 3D and bumps the version', async () => {
    const user = await signUp()
    const { projectId, scene, version } = await convertedProject(user)
    await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(user.auth)
      .send({ sceneData: withSofa(scene), baseVersion: version, metadata: { grid: { width: 9 } } })
      .expect(200)

    const again = await api().post(`/api/projects/${projectId}/convert`).set(user.auth).expect(201)
    expect(again.body.scene.version).toBe(3)
    expect(again.body.scene.sceneData.assets).toHaveLength(1)

    const active = await api().get(`/api/projects/${projectId}/scene`).set(user.auth).expect(200)
    expect(active.body.scene.version).toBe(3)
    expect(active.body.scene.metadata).toEqual({ grid: { width: 9 } })
    expect(await prisma.scene.count({ where: { projectId, isActive: true } })).toBe(1)
  })

  test('a plan that cannot be converted is a 422, and the job says why', async () => {
    const user = await signUp()
    const projectId = await createProject(user)
    // Bypass the API's canvas-v2 check: an old stored canvas in a broken shape.
    await prisma.project.update({
      where: { id: projectId },
      data: { canvas: { version: 'canvas-v2', walls: 'broken' } },
    })
    const res = await api().post(`/api/projects/${projectId}/convert`).set(user.auth).expect(422)
    expect(errorOf(res).code).toBe('CONVERSION_FAILED')
    const job = await prisma.job.findUniqueOrThrow({ where: { id: res.body.details.jobId } })
    expect(job).toMatchObject({ status: 'failed', errorCode: 'CONVERSION_FAILED' })
  })
})

describe('scene save and load', () => {
  test('nothing converted yet: GET is a 404 the editor understands', async () => {
    const user = await signUp()
    const projectId = await createProject(user)
    const res = await api().get(`/api/projects/${projectId}/scene`).set(user.auth).expect(404)
    expect(errorOf(res).code).toBe('SCENE_NOT_FOUND')
  })

  test('saving assigns furniture to the room it stands in', async () => {
    const user = await signUp()
    const { projectId, scene, version } = await convertedProject(user)
    const bedroom = scene.rooms!.find((r) => r.type === 'bedroom')!

    const res = await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(user.auth)
      .send({ sceneData: withSofa(scene, 6.8, 2), baseVersion: version })
      .expect(200)
    expect(res.body.scene.version).toBe(version + 1)

    const saved = await api().get(`/api/projects/${projectId}/scene`).set(user.auth).expect(200)
    expect(saved.body.scene.sceneData.assets[0].roomId).toBe(bedroom.id)
  })

  test('a stale baseVersion is a 409 with the current version', async () => {
    const user = await signUp()
    const { projectId, scene, version } = await convertedProject(user)
    await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(user.auth)
      .send({ sceneData: scene, baseVersion: version })
      .expect(200)
    const stale = await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(user.auth)
      .send({ sceneData: scene, baseVersion: version })
      .expect(409)
    expect(errorOf(stale).code).toBe('SCENE_VERSION_CONFLICT')
    expect(stale.body.details).toEqual({ currentVersion: version + 1 })
  })

  test('a project with no scene yet starts at version 1 on first save', async () => {
    const user = await signUp()
    const { scene } = await convertedProject(user)
    const empty = await createProject(user, { type: '3d' })
    const res = await api()
      .put(`/api/projects/${empty}/scene`)
      .set(user.auth)
      .send({ sceneData: scene })
      .expect(201)
    expect(res.body.scene.version).toBe(1)
  })

  test('rejects an invalid scene, and other users', async () => {
    const owner = await signUp()
    const other = await signUp()
    const { projectId, scene } = await convertedProject(owner)
    const bad = await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(owner.auth)
      .send({ sceneData: { walls: [] } })
      .expect(400)
    expect(errorOf(bad).message).toMatch(/^must be a valid scene-v1/)

    await api().get(`/api/projects/${projectId}/scene`).set(other.auth).expect(404)
    await api()
      .put(`/api/projects/${projectId}/scene`)
      .set(other.auth)
      .send({ sceneData: scene })
      .expect(404)
    await api().post(`/api/projects/${projectId}/convert`).set(other.auth).expect(404)
  })
})

describe('GLB exports and project files', () => {
  const glb = Buffer.from('glTF-binary-test')

  test('keeps only the newest GLB_KEEP exports, deleting older files', async () => {
    const user = await signUp()
    const projectId = await createProject(user)
    expect(
      errorOf(await api().get(`/api/projects/${projectId}/glb`).set(user.auth).expect(404)).code,
    ).toBe('GLB_NOT_FOUND')

    const urls: string[] = []
    for (let i = 0; i < env.GLB_KEEP + 1; i++) {
      const res = await api()
        .post(`/api/projects/${projectId}/glb`)
        .set(user.auth)
        .attach('glb', glb, { filename: 'scene.glb', contentType: 'model/gltf-binary' })
        .expect(201)
      urls.push(res.body.url)
      await new Promise((r) => setTimeout(r, 5)) // distinct timestamps in the file names
    }

    expect(await prisma.vrOutput.count({ where: { projectId } })).toBe(env.GLB_KEEP)
    const onDisk = (url: string) =>
      fs.existsSync(path.join(env.UPLOAD_DIR, url.replace('/uploads/', '')))
    expect(onDisk(urls[0])).toBe(false)
    expect(onDisk(urls.at(-1)!)).toBe(true)

    const latest = await api().get(`/api/projects/${projectId}/glb`).set(user.auth).expect(200)
    expect(latest.body.url).toBe(urls.at(-1))
  })

  test('stores models and textures imported in the 3D editor', async () => {
    const user = await signUp()
    const projectId = await createProject(user)
    const res = await api()
      .post(`/api/projects/${projectId}/files`)
      .set(user.auth)
      .attach('file', PNG, {
        filename: 'wood grain.png',
        contentType: 'image/png',
      })
      .expect(201)
    expect(res.body.url).toMatch(
      new RegExp(`^/uploads/project-files/${projectId}/\\d+-wood_grain\\.png$`),
    )
    await api().get(res.body.url).expect(200)

    const txt = await api()
      .post(`/api/projects/${projectId}/files`)
      .set(user.auth)
      .attach('file', Buffer.from('x'), { filename: 'notes.txt', contentType: 'text/plain' })
      .expect(400)
    expect(errorOf(txt).code).toBe('INVALID_FILE_TYPE')
    await api().post(`/api/projects/${projectId}/files`).set(user.auth).expect(400)
    await api().post(`/api/projects/${projectId}/glb`).set(user.auth).expect(400)
  })
})

describe('POST /api/projects/:id/suggestions', () => {
  test('suggests furniture per room, each with a spot inside that room', async () => {
    const user = await signUp()
    const { projectId, scene } = await convertedProject(user)
    const res = await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(user.auth)
      .send({ scene })
      .expect(200)

    expect(res.body.recommender).toBe('rules-v1')
    const living = res.body.rooms.find((r: { type: string }) => r.type === 'living')
    expect(living.suggestions[0]).toMatchObject({
      role: 'sofa',
      item: { id: expect.stringMatching(/^kenney-/), dimensions: expect.any(Object) },
      placement: { position: expect.any(Object), rotationY: expect.any(Number) },
    })
  })

  test('honours roomId and limit, and counts unsaved furniture', async () => {
    const user = await signUp()
    const { projectId, scene } = await convertedProject(user)
    const bedroom = scene.rooms!.find((r) => r.type === 'bedroom')!
    const res = await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(user.auth)
      .send({ scene, roomId: bedroom.id, limit: 2 })
      .expect(200)
    expect(res.body.rooms).toHaveLength(1)
    expect(res.body.rooms[0].suggestions).toHaveLength(2)

    // A sofa already in the living room (not saved): no sofa suggestion there.
    const withOne = await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(user.auth)
      .send({ scene: withSofa(scene) })
      .expect(200)
    const living = withOne.body.rooms.find((r: { type: string }) => r.type === 'living')
    expect(living.suggestions.map((s: { role: string }) => s.role)).not.toContain('sofa')
  })

  test('validates the body and the owner', async () => {
    const owner = await signUp()
    const other = await signUp()
    const { projectId, scene } = await convertedProject(owner)
    await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(owner.auth)
      .send({ scene, limit: 50 })
      .expect(400)
    await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(owner.auth)
      .send({ scene: twoRoomCanvas() })
      .expect(400)
    await api()
      .post(`/api/projects/${projectId}/suggestions`)
      .set(other.auth)
      .send({ scene })
      .expect(404)
  })
})
