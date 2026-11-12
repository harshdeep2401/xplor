import { test } from 'vitest'
import assert from 'node:assert/strict'

const base = {
  DATABASE_URL: 'postgresql://test@localhost/test',
  JWT_SECRET: 'x'.repeat(40),
}

test('defaults fill in and blank values count as unset', async () => {
  const { loadEnv } = await import('./env')
  const env = loadEnv({ ...base, PORT: '', GLB_KEEP: '' })
  assert.equal(env.PORT, 5001)
  assert.equal(env.GLB_KEEP, 2)
  assert.equal(env.NODE_ENV, 'development')
  assert.ok(env.CORS_ORIGINS.includes('http://localhost:5173'))
})

test('values are converted and checked', async () => {
  const { loadEnv } = await import('./env')
  const env = loadEnv({
    ...base,
    PORT: '8080',
    CORS_ORIGINS: ' https://a.test , https://b.test ',
    FIREBASE_PRIVATE_KEY: 'line1\\nline2',
  })
  assert.equal(env.PORT, 8080)
  assert.deepEqual(env.CORS_ORIGINS, ['https://a.test', 'https://b.test'])
  assert.equal(env.FIREBASE_PRIVATE_KEY, 'line1\nline2')
  assert.throws(() => loadEnv({ ...base, PORT: 'abc' }), /PORT/)
  assert.throws(() => loadEnv({ ...base, FASTAPI_SECRET: 'short' }), /FASTAPI_SECRET/)
})

test('missing required values are named', async () => {
  const { loadEnv } = await import('./env')
  assert.throws(() => loadEnv({ JWT_SECRET: 'x' }), /DATABASE_URL is required/)
})

test('production demands strong secrets and no wildcard origin', async () => {
  const { loadEnv } = await import('./env')
  const prod = { ...base, NODE_ENV: 'production', FASTAPI_SECRET: 'f'.repeat(40) }
  assert.doesNotThrow(() => loadEnv(prod))
  assert.throws(() => loadEnv({ ...prod, JWT_SECRET: 'short' }), /JWT_SECRET/)
  assert.throws(() => loadEnv({ ...prod, FASTAPI_SECRET: '' }), /FASTAPI_SECRET/)
  assert.throws(() => loadEnv({ ...prod, CORS_ORIGINS: '*' }), /CORS_ORIGINS/)
})
