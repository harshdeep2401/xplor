import { afterEach, expect, test, vi } from 'vitest'
import type * as EnvModule from './env'

const initializeApp = vi.fn(() => ({ auth: () => 'auth-instance' }))
const cert = vi.fn((c: unknown) => ({ cert: c }))
vi.mock('firebase-admin', () => ({ default: { initializeApp, credential: { cert } } }))

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('./env')
  vi.clearAllMocks()
})

const withEnv = (firebase: Record<string, string | undefined>) =>
  vi.doMock('./env', async (importOriginal) => {
    const real = await importOriginal<typeof EnvModule>()
    return { env: { ...real.env, ...firebase } }
  })

test('starts Firebase once, on first use, from the three service-account values', async () => {
  withEnv({
    FIREBASE_PROJECT_ID: 'proj',
    FIREBASE_CLIENT_EMAIL: 'svc@proj.test',
    FIREBASE_PRIVATE_KEY: 'key',
  })
  const { firebaseAuth } = await import('./firebaseAdmin')
  expect(initializeApp).not.toHaveBeenCalled()
  expect(firebaseAuth()).toBe('auth-instance')
  firebaseAuth()
  expect(initializeApp).toHaveBeenCalledTimes(1)
  expect(cert).toHaveBeenCalledWith({
    projectId: 'proj',
    clientEmail: 'svc@proj.test',
    privateKey: 'key',
  })
})

test('without credentials it refuses clearly instead of crashing the server', async () => {
  withEnv({ FIREBASE_PROJECT_ID: undefined, FIREBASE_CLIENT_EMAIL: undefined })
  const { firebaseAuth } = await import('./firebaseAdmin')
  expect(() => firebaseAuth()).toThrow('Google sign-in is not configured on this server.')
  expect(initializeApp).not.toHaveBeenCalled()
})
