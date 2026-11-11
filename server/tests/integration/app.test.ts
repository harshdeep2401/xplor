import { describe, expect, test, vi } from 'vitest'
import { api, errorOf, signUp } from './helpers'

vi.mock('../../services/aiService', () => ({
  processFloorPlan: vi.fn(),
  getAiStatus: async () => ({ reachable: false, route: null, error: 'AI service offline' }),
}))

describe('health checks', () => {
  test('live and ready (the test database answers)', async () => {
    expect((await api().get('/live').expect(200)).body).toEqual({ status: 'ok' })
    expect((await api().get('/ready').expect(200)).body).toEqual({ status: 'ready' })
    await api().get('/').expect(200)
  })
})

describe('GET /api/assets', () => {
  test('lists the whole furniture catalog with real-world sizes', async () => {
    const user = await signUp()
    const res = await api().get('/api/assets').set(user.auth).expect(200)
    expect(res.body.assets.length).toBeGreaterThanOrEqual(100)
    const sofa = res.body.assets.find((a: { name: string }) => a.name === 'Sofa')
    expect(sofa).toMatchObject({
      id: 'kenney-loungeSofa',
      fileUrl: '/static/furniture/models/loungeSofa.glb',
      placement: 'floor',
      roomTypes: expect.arrayContaining(['living']),
      dimensions: { x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) },
    })
    // The model behind it is served.
    await api().get(sofa.fileUrl).expect(200)
  })

  test('needs a signed-in user', async () => {
    await api().get('/api/assets').expect(401)
  })
})

describe('GET /api/system/status', () => {
  test('reports the server, database and AI service', async () => {
    const user = await signUp()
    const res = await api().get('/api/system/status').set(user.auth).expect(200)
    expect(res.body).toMatchObject({
      server: { ok: true, node: process.version },
      database: { ok: true, latencyMs: expect.any(Number) },
      ai: { reachable: false, error: 'AI service offline' },
      recentCalls: expect.any(Array),
    })
  })
})

describe('error responses', () => {
  test('unknown routes, bad JSON and CORS', async () => {
    const user = await signUp()
    expect(errorOf(await api().get('/api/nope').set(user.auth).expect(404)).code).toBe(
      'ROUTE_NOT_FOUND',
    )
    const badJson = await api()
      .post('/api/projects')
      .set(user.auth)
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400)
    expect(errorOf(badJson)).toEqual({
      code: 'INVALID_JSON',
      message: 'The request body is not valid JSON.',
    })

    const allowed = await api().get('/live').set('Origin', 'http://localhost:5173')
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const blocked = await api().get('/live').set('Origin', 'https://evil.example')
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined()
  })
})
