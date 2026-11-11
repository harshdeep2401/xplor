// A fake API for component tests (MSW). Requests to the test API base URL are
// answered by the handlers a test registers with `server.use(...)`; anything
// unhandled fails the test, so no test can reach a real server by accident.
import { setupServer } from 'msw/node'

export const API = 'http://api.test/api'

export const server = setupServer()

// One catalog item in the shape GET /api/assets returns.
export const catalogItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'kenney-loungeSofa',
  name: 'Sofa',
  category: 'living',
  fileUrl: '/static/furniture/models/loungeSofa.glb',
  thumbnailUrl: '/static/furniture/previews/loungeSofa.png',
  dimensions: { x: 2.1, y: 0.85, z: 0.9 },
  roomTypes: ['living'],
  tags: ['sofa', 'couch'],
  placement: 'floor',
  ...overrides,
})

// A session token whose payload expires `secondsFromNow` from now.
export function fakeToken(secondsFromNow = 3600): string {
  const payload = { id: 'u1', exp: Math.floor(Date.now() / 1000) + secondsFromNow }
  return `header.${btoa(JSON.stringify(payload))}.signature`
}
