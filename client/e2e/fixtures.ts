// Shared pieces for the end-to-end tests: a signed-in user, projects made
// through the API (fast and exact), and a way to read back what was saved.
import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test'
import { API_URL } from '../playwright.config'

export { expect }

let counter = 0

export interface E2EUser {
  name: string
  email: string
  password: string
  token: string
  user: { id: string; name: string; email: string }
}

// Every e2e email matches e2e-*@example.test: globalTeardown deletes them.
export const e2eEmail = () => `e2e-${Date.now()}-${++counter}@example.test`

export class Api {
  constructor(
    private request: APIRequestContext,
    private token = '',
  ) {}

  private headers(): Record<string, string> {
    return this.token ? { Authorization: `Bearer ${this.token}` } : {}
  }

  async signUp(name = 'E2E Tester'): Promise<E2EUser> {
    const email = e2eEmail()
    const password = 'Testing123'
    const res = await this.request.post(`${API_URL}/auth/register`, {
      data: { name, email, password },
    })
    expect(res.status()).toBe(201)
    const body = (await res.json()) as { token: string; user: E2EUser['user'] }
    this.token = body.token
    return { name, email, password, token: body.token, user: body.user }
  }

  async createProject(data: Record<string, unknown> = { name: 'E2E plan' }): Promise<string> {
    const res = await this.request.post(`${API_URL}/projects`, { headers: this.headers(), data })
    expect(res.status()).toBe(201)
    return ((await res.json()) as { project: { id: string } }).project.id
  }

  async saveCanvas(projectId: string, canvas: unknown) {
    const res = await this.request.put(`${API_URL}/projects/${projectId}`, {
      headers: this.headers(),
      data: { canvas },
    })
    expect(res.status()).toBe(200)
  }

  async convert(projectId: string) {
    const res = await this.request.post(`${API_URL}/projects/${projectId}/convert`, {
      headers: this.headers(),
    })
    expect(res.status()).toBe(201)
  }

  // The 2D drawing as saved (canvas-v2).
  async canvas(projectId: string): Promise<SavedCanvas> {
    const res = await this.request.get(`${API_URL}/projects/${projectId}`, {
      headers: this.headers(),
    })
    return ((await res.json()) as { project: { canvas: SavedCanvas } }).project.canvas
  }

  // The 3D scene as saved (scene-v1), or null before the first conversion.
  async scene(projectId: string): Promise<SavedScene | null> {
    const res = await this.request.get(`${API_URL}/projects/${projectId}/scene`, {
      headers: this.headers(),
    })
    if (res.status() === 404) return null
    return ((await res.json()) as { scene: { sceneData: SavedScene } }).scene.sceneData
  }
}

export interface SavedCanvas {
  scale?: { pixelsPerMetre: number }
  walls?: { id: string; start: { x: number; y: number }; end: { x: number; y: number } }[]
  openings?: { type: 'door' | 'window'; wallId: string }[]
  labels?: { text: string }[]
}

export interface SavedScene {
  walls: unknown[]
  rooms?: { id: string; name?: string; type: string }[]
  assets?: { name?: string; catalogId?: string; roomId?: string }[]
}

// Sign the browser in as `user` before any page script runs (what the app
// does after a successful login: token + user in localStorage).
export async function signInBrowser(page: Page, user: E2EUser) {
  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(user))
    },
    { token: user.token, user: user.user },
  )
}

// A 5 × 4 m living room next to a 3.6 × 4 m bedroom, joined by a door.
export const twoRoomCanvas = {
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

// Fixtures: `api` (signed in as `user`), `user`, and a `page` already signed in.
export const test = base.extend<{ api: Api; user: E2EUser; consoleErrors: string[] }>({
  api: async ({ request }, use) => {
    await use(new Api(request))
  },
  user: async ({ api, page }, use) => {
    const user = await api.signUp()
    await signInBrowser(page, user)
    await use(user)
  },
  // Errors the page logs; tests assert there are none.
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      const where = msg.location().url
      errors.push(where ? `${msg.text()} (${where})` : msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))
    await use(errors)
  },
})
