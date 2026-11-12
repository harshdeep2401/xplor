import { Writable } from 'stream'
import express from 'express'
import pino from 'pino'
import request from 'supertest'
import { describe, expect, test } from 'vitest'
import { loggerOptions } from '../config/logger'
import { requestLogger } from './requestLogger'
import { errorHandler } from './errorHandler'

// A logger that writes JSON lines into an array instead of stdout.
function capture() {
  const lines: Record<string, unknown>[] = []
  const stream = new Writable({
    write(chunk: Buffer, _enc, done) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
      done()
    },
  })
  return { logger: pino(loggerOptions('debug'), stream), lines }
}

function appWith(logger: pino.Logger) {
  const app = express()
  app.use(requestLogger(logger))
  app.get('/projects', (req, res) => {
    req.user = { id: 'user-1', name: 'Ada', email: 'ada@example.test' }
    res.json([])
  })
  app.get('/boom', () => {
    throw new Error('database exploded')
  })
  app.get('/live', (_req, res) => {
    res.json({ status: 'ok' })
  })
  app.use(errorHandler)
  return app
}

const requestLines = (lines: Record<string, unknown>[]) => lines.filter((l) => 'res' in l)

describe('request logging', () => {
  test('one line per request with id, status, time and user — never the token', async () => {
    const { logger, lines } = capture()
    const res = await request(appWith(logger))
      .get('/projects')
      .set('Authorization', 'Bearer secret-token-value')
      .expect(200)

    const id = res.headers['x-request-id']
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    const [line] = requestLines(lines)
    expect(line).toMatchObject({
      level: 30,
      service: 'xplor-api',
      userId: 'user-1',
      req: { id, method: 'GET', url: '/projects' },
      res: { statusCode: 200 },
      msg: expect.stringMatching(/^GET \/projects 200 \d+ms$/),
    })
    expect(JSON.stringify(lines)).not.toContain('secret-token-value')
  })

  test('a valid incoming X-Request-Id is kept; anything else is replaced', async () => {
    const { logger } = capture()
    const app = appWith(logger)
    const kept = await request(app).get('/projects').set('X-Request-Id', 'abc-123')
    expect(kept.headers['x-request-id']).toBe('abc-123')
    const replaced = await request(app).get('/projects').set('X-Request-Id', '<script>')
    expect(replaced.headers['x-request-id']).not.toBe('<script>')
  })

  test('server errors are logged at error level with the stack; the client gets no details', async () => {
    const { logger, lines } = capture()
    const res = await request(appWith(logger)).get('/boom').expect(500)
    expect(res.body.code).toBe('INTERNAL_ERROR')
    const [line] = requestLines(lines)
    expect(line.level).toBe(50)
    expect(line.err).toMatchObject({ message: 'database exploded', stack: expect.any(String) })
  })

  test('health probes are not logged', async () => {
    const { logger, lines } = capture()
    await request(appWith(logger)).get('/live').expect(200)
    expect(requestLines(lines)).toEqual([])
  })
})

describe('redaction', () => {
  test('passwords, tokens and secrets never reach the logs', () => {
    const { logger, lines } = capture()
    logger.info(
      {
        password: 'p1',
        token: 't1',
        body: { password: 'p2', token: 't2' },
        config: { secret: 's1', privateKey: 'k1' },
        req: { headers: { authorization: 'Bearer x', cookie: 'c=1' } },
      },
      'test',
    )
    const out = JSON.stringify(lines[0])
    for (const leaked of ['p1', 'p2', 't1', 't2', 's1', 'k1', 'Bearer x', 'c=1']) {
      expect(out).not.toContain(`"${leaked}"`)
    }
    expect(lines[0].password).toBe('[redacted]')
  })
})
