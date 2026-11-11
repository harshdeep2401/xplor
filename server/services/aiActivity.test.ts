import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aiBaseUrl, describeRoute, recordAiCall, recentAiCalls } from './aiActivity'

test('the base URL drops the detection path', () => {
  assert.equal(
    aiBaseUrl('https://a-b.trycloudflare.com/process-floor-plan'),
    'https://a-b.trycloudflare.com',
  )
  assert.equal(aiBaseUrl('http://127.0.0.1:8000/process-floor-plan'), 'http://127.0.0.1:8000')
  assert.equal(
    aiBaseUrl('https://ai.example.com/xplor/process-floor-plan/'),
    'https://ai.example.com/xplor',
  )
})

test('a CF-Ray header marks the call as tunnelled and names the data centre', () => {
  const route = describeRoute('https://ai.example.com/process-floor-plan', '8f1c2a3b4c5d6e7f-sin')
  assert.deepEqual(route, {
    via: 'cloudflare-tunnel',
    host: 'ai.example.com',
    cfRay: '8f1c2a3b4c5d6e7f-sin',
    cfColo: 'SIN',
  })
})

test('a local URL without CF-Ray is direct', () => {
  const route = describeRoute('http://127.0.0.1:8000/process-floor-plan', null)
  assert.equal(route.via, 'direct')
  assert.equal(route.host, '127.0.0.1')
})

test('the activity log keeps the newest calls first, capped', () => {
  for (let i = 0; i < 30; i++) {
    recordAiCall({
      ...describeRoute('http://127.0.0.1:8000/process-floor-plan', null),
      at: new Date().toISOString(),
      jobId: `j${i}`,
      ok: true,
      httpStatus: 200,
      roundTripMs: 5,
      processingMs: 3,
      method: 'unet-mitb3',
      error: null,
    })
  }
  const calls = recentAiCalls()
  assert.equal(calls.length, 25)
  assert.equal(calls[0].jobId, 'j29')
})
