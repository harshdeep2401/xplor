import { test } from 'vitest'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { registerBody, loginBody } from './auth'
import { createProjectBody, saveProjectBody, saveSceneBody, suggestionsBody } from './projects'
import { jobsQuery, updateJobStatusBody } from './jobs'
import { idParams } from './common'
import { validate } from '../middleware/validate'
import { errorBody, toAppError } from '../middleware/errorHandler'

const firstMessage = (r: { success: boolean; error?: z.ZodError }) => r.error?.issues[0]?.message

test('register: trims fields and enforces the password rule', () => {
  const ok = registerBody.safeParse({
    name: '  Ada ',
    email: ' ada@example.test ',
    password: 'Secret1',
  })
  assert.ok(ok.success)
  assert.equal(ok.data.name, 'Ada')
  assert.equal(ok.data.email, 'ada@example.test')

  const weak = registerBody.safeParse({
    name: 'Ada',
    email: 'ada@example.test',
    password: 'secret1',
  })
  assert.match(firstMessage(weak) ?? '', /capital letter/)
  const badEmail = registerBody.safeParse({ name: 'Ada', email: 'nope', password: 'Secret1' })
  assert.equal(firstMessage(badEmail), 'Please enter a valid email address.')
  const tooLong = registerBody.safeParse({
    name: 'Ada',
    email: 'ada@example.test',
    password: 'A'.repeat(73),
  })
  assert.match(firstMessage(tooLong) ?? '', /at most 72/)
})

test('login: missing fields get readable messages', () => {
  const r = loginBody.safeParse({ email: 'ada@example.test' })
  assert.equal(firstMessage(r), 'Please enter your password.')
  assert.equal(
    firstMessage(loginBody.safeParse(undefined)),
    'Invalid input: expected object, received undefined',
  )
})

test('createProject: defaults, rounding and type', () => {
  const r = createProjectBody.parse({ name: '   ', canvasWidth: 7.5 })
  assert.equal(r.name, 'Untitled Floor Plan')
  assert.equal(r.canvasWidth, 8)
  assert.equal(r.type, '2d')
  assert.equal(createProjectBody.safeParse({ type: 'vr' }).success, false)
  assert.equal(createProjectBody.safeParse({ canvasWidth: 0 }).success, false)
  assert.equal(createProjectBody.safeParse({ canvasWidth: '100' }).success, false)
})

test('saveProject: the canvas must be canvas-v2', () => {
  const canvas = {
    version: 'canvas-v2',
    scale: { pixelsPerMetre: 100 },
    wallHeight: 2.8,
    walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, thickness: 10 }],
  }
  assert.ok(saveProjectBody.safeParse({ canvas }).success)
  const bad = saveProjectBody.safeParse({ canvas: { elements: [] } })
  assert.equal(bad.success, false)
  assert.match(firstMessage(bad) ?? '', /^must be a valid canvas-v2/)
})

test('saveScene / suggestions: scene-v1 and bounded numbers', () => {
  assert.equal(saveSceneBody.safeParse({ sceneData: { nope: 1 } }).success, false)
  assert.equal(suggestionsBody.safeParse({ scene: {} }).success, false)
  const sceneless = suggestionsBody.safeParse({ scene: null, limit: 50 })
  assert.equal(sceneless.success, false)
  assert.equal(sceneless.error?.issues.length, 2)
})

test('jobs: status enum and ids', () => {
  assert.ok(jobsQuery.safeParse({}).success)
  assert.equal(jobsQuery.safeParse({ status: 'done' }).success, false)
  assert.match(firstMessage(updateJobStatusBody.safeParse({})) ?? '', /^status must be one of/)
  assert.equal(idParams.safeParse({ id: 'cmwc2m47u0002viw4xqtu9m9b' }).success, true)
  assert.equal(idParams.safeParse({ id: "1' OR '1'='1" }).success, false)
})

test('validate(): replaces input with parsed values, or reports every problem', () => {
  type Req = Parameters<ReturnType<typeof validate>>[0]
  const mw = validate({ params: idParams, body: createProjectBody })
  // Runs the middleware and returns what it passed to next().
  const run = (req: Req) => {
    let passed: unknown = 'next() not called'
    mw(req, {} as never, (err?: unknown) => (passed = err))
    return passed
  }

  const req = { params: { id: 'abc' }, query: {}, body: { name: ' Plan ' } } as unknown as Req
  assert.equal(run(req), undefined)
  assert.equal((req.body as { name: string }).name, 'Plan')

  const failure = run({ params: { id: '!' }, query: {}, body: { type: 'x' } } as unknown as Req)
  if (!(failure instanceof z.ZodError)) throw new Error('expected a ZodError')
  const body = errorBody(toAppError(failure))
  assert.equal(body.code, 'VALIDATION_FAILED')
  assert.deepEqual(
    (body.details as { path: string }[]).map((d) => d.path),
    ['params.id', 'body.type'],
  )
})
