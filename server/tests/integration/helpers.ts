// Shared pieces for the integration tests: the app, signed-in users, and
// sample plans.
import request from 'supertest'
import { createApp } from '../../app'
import type { CanvasV2, SceneV1 } from '../../services/converter'

export const app = createApp()
export const api = () => request(app)

let counter = 0

export interface TestUser {
  id: string
  email: string
  token: string
  auth: { Authorization: string }
}

// Register a fresh user through the API and return its token.
export async function signUp(name = 'Test User'): Promise<TestUser> {
  counter += 1
  const email = `user${counter}-${Date.now()}@example.test`
  const res = await api()
    .post('/api/auth/register')
    .send({ name, email, password: 'Testing123' })
    .expect(201)
  const token = res.body.token as string
  return { id: res.body.user.id, email, token, auth: { Authorization: `Bearer ${token}` } }
}

// Create a project for `user` through the API; returns its id.
export async function createProject(
  user: TestUser,
  body: Record<string, unknown> = { name: 'Plan' },
): Promise<string> {
  const res = await api().post('/api/projects').set(user.auth).send(body).expect(201)
  return res.body.project.id as string
}

// A 5 × 4 m living room next to a 3.6 × 4 m bedroom, joined by a door.
// 100 px = 1 m.
export function twoRoomCanvas(): CanvasV2 {
  return {
    version: 'canvas-v2',
    scale: { pixelsPerMetre: 100 },
    wallHeight: 2.8,
    walls: [
      { id: 'n1', start: { x: 0, y: 0 }, end: { x: 500, y: 0 }, thickness: 10 },
      { id: 'n2', start: { x: 500, y: 0 }, end: { x: 860, y: 0 }, thickness: 10 },
      { id: 'e', start: { x: 860, y: 0 }, end: { x: 860, y: 400 }, thickness: 10 },
      { id: 's2', start: { x: 860, y: 400 }, end: { x: 500, y: 400 }, thickness: 10 },
      { id: 's1', start: { x: 500, y: 400 }, end: { x: 0, y: 400 }, thickness: 10 },
      { id: 'w', start: { x: 0, y: 400 }, end: { x: 0, y: 0 }, thickness: 10 },
      { id: 'mid', start: { x: 500, y: 0 }, end: { x: 500, y: 400 }, thickness: 10 },
    ],
    openings: [{ id: 'd1', type: 'door', wallId: 'mid', offset: 0.75, width: 90, height: 2.1 }],
    labels: [
      { id: 'l1', position: { x: 250, y: 200 }, text: 'Living room' },
      { id: 'l2', position: { x: 680, y: 200 }, text: 'Bedroom' },
    ],
  }
}

// A project with the two-room plan saved and converted to 3D.
export async function convertedProject(
  user: TestUser,
): Promise<{ projectId: string; scene: SceneV1; version: number }> {
  const projectId = await createProject(user)
  await api()
    .put(`/api/projects/${projectId}`)
    .set(user.auth)
    .send({ canvas: twoRoomCanvas() })
    .expect(200)
  const res = await api().post(`/api/projects/${projectId}/convert`).set(user.auth).expect(201)
  return { projectId, scene: res.body.scene.sceneData, version: res.body.scene.version }
}

// The `{ message, code }` every error response carries.
export const errorOf = (res: request.Response) => ({
  code: res.body.code as string,
  message: res.body.message as string,
})
