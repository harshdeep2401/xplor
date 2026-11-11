import { test } from 'vitest'
import assert from 'node:assert/strict'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

const load = async () => {
  const { errorBody, errorHandler, notFoundHandler, toAppError } = await import('./errorHandler')
  const errors = await import('../errors')
  return { errorBody, errorHandler, notFoundHandler, toAppError, ...errors }
}

// A minimal stand-in for Express's res: records the status and JSON body.
function fakeRes() {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code
      return res
    },
    json(body: unknown) {
      res.body = body
      return res
    },
  }
  return res
}

test('app errors keep their status, code, message and details', async () => {
  const { toAppError, errorBody, ConflictError, NotFoundError, UnauthorizedError } = await load()
  const conflict = toAppError(new ConflictError('Stale.', 'SCENE_VERSION_CONFLICT', { v: 3 }))
  assert.equal(conflict.status, 409)
  assert.deepEqual(errorBody(conflict), {
    message: 'Stale.',
    code: 'SCENE_VERSION_CONFLICT',
    details: { v: 3 },
  })
  assert.deepEqual(errorBody(new NotFoundError()), { message: 'Not found.', code: 'NOT_FOUND' })
  assert.equal(new UnauthorizedError().status, 401)
})

test('validation errors become 400 VALIDATION_FAILED with every problem', async () => {
  const { toAppError } = await load()
  const zodError = z.object({ a: z.string(), b: z.number() }).safeParse({}).error!
  const e = toAppError(zodError)
  assert.equal(e.status, 400)
  assert.equal(e.code, 'VALIDATION_FAILED')
  assert.equal((e.details as unknown[]).length, 2)
})

test('library errors get proper statuses', async () => {
  const { toAppError } = await load()
  assert.equal(toAppError(new multer.MulterError('LIMIT_FILE_SIZE')).status, 413)
  assert.equal(toAppError(new multer.MulterError('LIMIT_UNEXPECTED_FILE')).status, 400)
  assert.equal(
    toAppError(Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed' })).code,
    'INVALID_JSON',
  )
  assert.equal(toAppError(Object.assign(new Error('x'), { type: 'entity.too.large' })).status, 413)
  const prisma = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('db', { code, clientVersion: 'test' })
  assert.equal(toAppError(prisma('P2025')).status, 404)
  assert.equal(toAppError(prisma('P2002')).status, 409)
})

test('unknown errors are 500s; the cause is kept for the log', async () => {
  const { toAppError } = await load()
  const boom = new Error('connection refused')
  const e = toAppError(boom)
  assert.equal(e.status, 500)
  assert.equal(e.code, 'INTERNAL_ERROR')
  assert.equal(e.cause, boom)
  // Development shows the cause's message; production hides it (env.test.ts covers env).
  assert.equal(e.message, 'connection refused')
  assert.equal(
    toAppError('a string').message,
    'Something went wrong on our side. Please try again.',
  )
})

test('the handler answers with JSON, or hands off if headers are already out', async () => {
  const { errorHandler, notFoundHandler, BadRequestError } = await load()
  const req = { method: 'GET', originalUrl: '/api/x', path: '/api/x' } as never
  const res = fakeRes()
  errorHandler(new BadRequestError('Nope.', 'NOPE'), req, res as never, () => {})
  assert.equal(res.statusCode, 400)
  assert.deepEqual(res.body, { message: 'Nope.', code: 'NOPE' })

  const sent = Object.assign(fakeRes(), { headersSent: true })
  let handedOff: unknown
  errorHandler(
    new BadRequestError('Late.'),
    req,
    sent as never,
    (err?: unknown) => (handedOff = err),
  )
  assert.ok(handedOff instanceof BadRequestError)
  assert.equal(sent.statusCode, 0)

  let notFound: unknown
  notFoundHandler(req, res as never, (err?: unknown) => (notFound = err))
  assert.equal((notFound as { code: string }).code, 'ROUTE_NOT_FOUND')
})
