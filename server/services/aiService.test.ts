import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { processFloorPlan, getAiStatus } from './aiService'
import { recentAiCalls } from './aiActivity'
import type * as EnvModule from '../config/env'

// The AI service is reached over HTTP; fetch is replaced per test.
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  fetchMock.mockReset()
})

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const args = {
  jobId: 'job-1',
  projectId: 'p-1',
  image: Buffer.from('png'),
  filename: 'plan.png',
  mimeType: 'image/png',
}

describe('processFloorPlan', () => {
  test('uploads the image with the shared secret and returns the checked result', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          status: 'completed',
          detection: { walls: [] },
          metadata: { imageWidth: 10, processingTimeMs: 42, method: 'unet', extra: 1 },
        },
        200,
        { 'cf-ray': 'abc-SIN' },
      ),
    )
    const result = await processFloorPlan(args)

    expect(result).toMatchObject({ status: 'completed', metadata: { imageWidth: 10, extra: 1 } })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(process.env.FASTAPI_WEBHOOK_URL)
    expect(init?.headers).toEqual({ Authorization: `Bearer ${process.env.FASTAPI_SECRET}` })
    const form = init?.body as FormData
    expect(form.get('jobId')).toBe('job-1')
    expect((form.get('image') as File).name).toBe('plan.png')

    expect(recentAiCalls()[0]).toMatchObject({
      jobId: 'job-1',
      ok: true,
      httpStatus: 200,
      processingMs: 42,
      method: 'unet',
      via: 'cloudflare-tunnel',
      cfColo: 'SIN',
    })
  })

  test('a detection failure is returned, not thrown', async () => {
    fetchMock.mockResolvedValueOnce(json({ status: 'failed', error: 'No walls' }))
    await expect(processFloorPlan(args)).resolves.toMatchObject({ error: 'No walls' })
    expect(recentAiCalls()[0]).toMatchObject({ ok: false, error: 'detection failed' })
  })

  test('HTTP errors are thrown with FastAPI’s detail', async () => {
    fetchMock.mockResolvedValueOnce(json({ detail: 'Model not loaded' }, 503))
    await expect(processFloorPlan(args)).rejects.toThrow(
      'AI service returned HTTP 503: Model not loaded',
    )
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 500 }))
    await expect(processFloorPlan(args)).rejects.toThrow(/^AI service returned HTTP 500$/)
  })

  test('an unexpected body is refused', async () => {
    fetchMock.mockResolvedValueOnce(json({ walls: [] }))
    await expect(processFloorPlan(args)).rejects.toThrow(/unexpected response/)
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 200 }))
    await expect(processFloorPlan(args)).rejects.toThrow(/unexpected response/)
  })

  test('unreachable and timed-out services are reported without the URL', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    const unreachable = processFloorPlan(args)
    await expect(unreachable).rejects.toThrow('Could not reach the AI service (is it running?)')

    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    await expect(processFloorPlan(args)).rejects.toThrow(/did not respond within \d+ms/)
    expect(recentAiCalls()[0].error).toBe('timeout')
  })
})

describe('getAiStatus', () => {
  test('reports the service status and how it was reached', async () => {
    fetchMock.mockResolvedValueOnce(json({ gpu: 'none' }))
    const status = await getAiStatus()
    expect(fetchMock.mock.calls[0][0]).toBe('http://ai.test.invalid/status')
    expect(status).toMatchObject({ reachable: true, error: null, status: { gpu: 'none' } })
  })

  test('explains a wrong secret, other HTTP errors and an unreachable service', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    expect((await getAiStatus()).error).toMatch(/FASTAPI_SECRET differs/)
    fetchMock.mockResolvedValueOnce(json({}, 502))
    expect((await getAiStatus()).error).toBe('The AI service answered HTTP 502')
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    expect(await getAiStatus()).toMatchObject({ reachable: false, status: null })
  })
})

describe('without FASTAPI_SECRET', () => {
  test('detection refuses to run and the status page says why', async () => {
    vi.resetModules()
    vi.doMock('../config/env', async (importOriginal) => {
      const real = await importOriginal<typeof EnvModule>()
      return { env: { ...real.env, FASTAPI_SECRET: undefined } }
    })
    const service = await import('./aiService')
    await expect(service.processFloorPlan(args)).rejects.toThrow(/FASTAPI_SECRET is not set/)
    expect((await service.getAiStatus()).error).toBe('FASTAPI_SECRET is not set on the server')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.doUnmock('../config/env')
  })
})
