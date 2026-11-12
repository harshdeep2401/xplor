import express from 'express'
import request from 'supertest'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { env } from '../config/env'
import { createLimiter, securityHeaders } from './security'
import { errorHandler } from './errorHandler'

// Tests run with RATE_LIMIT=off; these switch it on for themselves.
const mutableEnv = env as { RATE_LIMIT: 'on' | 'off' }
beforeEach(() => {
  mutableEnv.RATE_LIMIT = 'on'
})
afterEach(() => {
  mutableEnv.RATE_LIMIT = 'off'
})

function appWith(limiter: express.RequestHandler) {
  const app = express()
  app.use(limiter)
  app.get('/ok', (_req, res) => {
    res.json({ ok: true })
  })
  app.get('/fail', (_req, res) => {
    res.status(401).json({ ok: false })
  })
  app.use(errorHandler)
  return app
}

describe('rate limits', () => {
  test('after the limit: 429 RATE_LIMITED with Retry-After and RateLimit headers', async () => {
    const app = appWith(createLimiter({ what: 'tries', limit: 2, windowMs: 60_000 }))
    const first = await request(app).get('/ok').expect(200)
    expect(first.headers['ratelimit-policy']).toBeDefined()
    await request(app).get('/ok').expect(200)

    const blocked = await request(app).get('/ok').expect(429)
    expect(blocked.body).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many tries. Please wait 1 minute and try again.',
    })
    expect(blocked.headers['retry-after']).toBe('60')
  })

  test('failuresOnly: successful requests never use up the allowance', async () => {
    const app = appWith(
      createLimiter({
        what: 'sign-in attempts',
        limit: 2,
        windowMs: 15 * 60_000,
        failuresOnly: true,
      }),
    )
    for (let i = 0; i < 5; i++) await request(app).get('/ok').expect(200)
    await request(app).get('/fail').expect(401)
    await request(app).get('/fail').expect(401)
    const blocked = await request(app).get('/fail').expect(429)
    expect(blocked.body.message).toBe(
      'Too many sign-in attempts. Please wait 15 minutes and try again.',
    )
  })

  test('RATE_LIMIT=off switches every limiter off', async () => {
    mutableEnv.RATE_LIMIT = 'off'
    const app = appWith(createLimiter({ what: 'tries', limit: 1, windowMs: 60_000 }))
    for (let i = 0; i < 3; i++) await request(app).get('/ok').expect(200)
  })
})

describe('security headers', () => {
  test('hardening headers are set; resources stay loadable from the client origin', async () => {
    const app = express()
    app.use(securityHeaders)
    app.get('/', (_req, res) => {
      res.send('x')
    })
    const res = await request(app).get('/').expect(200)
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN')
    expect(res.headers['strict-transport-security']).toMatch(/max-age=/)
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/)
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
