import axios from 'axios'
import { http, HttpResponse } from 'msw'
import { afterEach, describe, expect, test, vi } from 'vitest'
import apiClient from './apiClient'
import { getApiErrorCode, getApiErrorMessage } from './errors'
import { clearSession, getToken, getUser, isAuthenticated, setSession } from './session'
import { fetchSuggestions, roomLabel } from './suggestions'
import { resolveServerUrl } from './serverUrl'
import { UnexpectedResponseError } from './apiSchemas'
import { API, fakeToken, server } from '../test/server'

afterEach(() => vi.restoreAllMocks())

describe('apiClient', () => {
  test('sends the session token with every request', async () => {
    let auth: string | null = null
    server.use(
      http.get(`${API}/projects`, ({ request }) => {
        auth = request.headers.get('Authorization')
        return HttpResponse.json({ projects: [] })
      }),
    )
    setSession('tok-123', { id: 'u1' })
    await apiClient.get('/projects')
    expect(auth).toBe('Bearer tok-123')
  })

  test('a 401 signs the user out and goes to the login page', async () => {
    const assign = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      pathname: '/dashboard',
      assign,
    })
    server.use(
      http.get(`${API}/projects`, () =>
        HttpResponse.json({ message: 'Expired', code: 'INVALID_TOKEN' }, { status: 401 }),
      ),
    )
    setSession('old', { id: 'u1' })
    await expect(apiClient.get('/projects')).rejects.toThrow()
    expect(getToken()).toBeNull()
    expect(assign).toHaveBeenCalledWith('/login')
  })

  test('other errors (e.g. someone else’s project, 404) keep the session', async () => {
    server.use(
      http.get(`${API}/projects/x`, () =>
        HttpResponse.json(
          { message: 'Project not found.', code: 'PROJECT_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    )
    setSession('tok', { id: 'u1' })
    const err = await apiClient.get('/projects/x').catch((e: unknown) => e)
    expect(getToken()).toBe('tok')
    expect(getApiErrorCode(err)).toBe('PROJECT_NOT_FOUND')
    expect(getApiErrorMessage(err, 'fallback')).toBe('Project not found.')
  })
})

describe('error helpers', () => {
  test('fall back sensibly for non-API errors', async () => {
    expect(getApiErrorMessage(new Error('boom'), 'Could not save.')).toBe('Could not save.')
    expect(getApiErrorCode(new Error('boom'))).toBeUndefined()

    server.use(http.get(`${API}/down`, () => HttpResponse.error()))
    const offline = await axios.get(`${API}/down`).catch((e: unknown) => e)
    expect(getApiErrorMessage(offline, 'x')).toMatch(/^Cannot reach the server/)

    server.use(http.get(`${API}/html`, () => HttpResponse.text('Bad gateway', { status: 502 })))
    const html = await axios.get(`${API}/html`).catch((e: unknown) => e)
    expect(getApiErrorMessage(html, 'Try again.')).toBe('Try again.')
    expect(getApiErrorCode(html)).toBeUndefined()

    const weird = new UnexpectedResponseError('3D scene', new (await import('zod')).z.ZodError([]))
    expect(getApiErrorMessage(weird, 'x')).toBe(
      'The server sent an unexpected 3D scene. Try reloading the page.',
    )
  })
})

describe('session', () => {
  test('stores, reads and clears the token and user', () => {
    setSession(fakeToken(), { id: 'u1', name: 'Ada' })
    expect(isAuthenticated()).toBe(true)
    expect(getUser()).toEqual({ id: 'u1', name: 'Ada' })
    clearSession()
    expect(getToken()).toBeNull()
    expect(isAuthenticated()).toBe(false)
  })

  test('a corrupt stored user reads as none; an unreadable token is still a token', () => {
    localStorage.setItem('user', '{not json')
    expect(getUser()).toBeNull()
    localStorage.setItem('token', 'not-a-jwt')
    expect(isAuthenticated()).toBe(true)
  })
})

describe('suggestions service', () => {
  test('fetches and checks the suggestions for the current scene', async () => {
    let body: unknown
    server.use(
      http.post(`${API}/projects/p1/suggestions`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({
          recommender: 'rules-v1',
          rooms: [{ roomId: 'r', type: 'kitchen', area: 9.96, suggestions: [] }],
        })
      }),
    )
    const scene = { version: 'scene-v1' } as never
    const rooms = await fetchSuggestions('p1', scene)
    expect(body).toEqual({ scene })
    expect(roomLabel(rooms[0], 0)).toBe('Kitchen (room 1) · 10 m²')
    expect(roomLabel({ ...rooms[0], name: 'Galley', type: 'mystery' }, 0)).toBe('Galley · 10 m²')
    expect(roomLabel({ ...rooms[0], type: 'mystery' }, 2)).toBe('Room (room 3) · 10 m²')
  })
})

test('server URLs resolve against the API origin; absolute ones pass through', () => {
  expect(resolveServerUrl('/uploads/a.png')).toBe('http://api.test/uploads/a.png')
  expect(resolveServerUrl('https://cdn.example/a.png')).toBe('https://cdn.example/a.png')
  expect(resolveServerUrl('blob:abc')).toBe('blob:abc')
})
