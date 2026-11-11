// Calls the FastAPI AI service's /process-floor-plan endpoint and returns
// its response. Talks over plain HTTP using Node's built-in fetch/FormData
// (Node 18+, no extra dependency needed).
//
// The image itself is uploaded (multipart/form-data), so the AI service never
// has to reach back into this server — it can run on another machine behind a
// tunnel (docs/guides/ai-hosting.md). Every call carries the shared secret.
//
// Sync by design for now: the caller awaits this and gets the full result
// back in one call. See ai-service/README.md ("Why sync, not async/webhook")
// for when/why that should change.

import { aiBaseUrl, describeRoute, recordAiCall } from './aiActivity'

// FASTAPI_WEBHOOK_URL is the *full* endpoint (e.g. http://127.0.0.1:8000/process-floor-plan),
// so we call it as-is and do NOT append a path. Falls back to the local default.
export const AI_SERVICE_ENDPOINT =
  process.env.FASTAPI_WEBHOOK_URL || 'http://localhost:8000/process-floor-plan'
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 30000

interface ProcessFloorPlanArgs {
  jobId: string
  projectId: string
  image: Buffer
  filename: string
  mimeType: string
}

// Shape of the FastAPI response. detection/metadata are passed straight through
// to Prisma JSON columns, so they're left loose here.
export interface FloorPlanResult {
  status: string
  detection?: any
  metadata?: any
  error?: string
}

// Throws on transport-level problems (service unreachable, timeout, non-2xx
// HTTP status, missing secret). A *detection* failure (bad image) is NOT
// thrown — it comes back as a normal { status: 'failed', error } object,
// matching the FastAPI contract, so callers should check result.status
// either way. Thrown messages end up on the Job (visible to the user), so they
// never include the AI service's URL.
export const processFloorPlan = async ({
  jobId,
  projectId,
  image,
  filename,
  mimeType,
}: ProcessFloorPlanArgs): Promise<FloorPlanResult> => {
  const secret = process.env.FASTAPI_SECRET
  if (!secret) {
    throw new Error('AI service is not configured on the server (FASTAPI_SECRET is not set)')
  }

  const form = new FormData()
  form.append('jobId', jobId)
  form.append('projectId', projectId)
  form.append('image', new Blob([new Uint8Array(image)], { type: mimeType }), filename)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS)

  // Every call goes into the System Status page's activity log.
  const at = new Date().toISOString()
  const started = Date.now()
  let response: Response | undefined
  const record = (ok: boolean, error: string | null, result?: FloorPlanResult) =>
    recordAiCall({
      ...describeRoute(AI_SERVICE_ENDPOINT, response?.headers.get('cf-ray') ?? null),
      at,
      jobId,
      ok,
      httpStatus: response?.status ?? null,
      roundTripMs: Date.now() - started,
      processingMs: result?.metadata?.processingTimeMs ?? null,
      method: result?.metadata?.method ?? null,
      error,
    })

  try {
    response = await fetch(AI_SERVICE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}` },
      body: form,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      record(false, 'timeout')
      throw new Error(`AI service did not respond within ${AI_SERVICE_TIMEOUT_MS}ms`)
    }
    console.error(`AI service request to ${AI_SERVICE_ENDPOINT} failed:`, error)
    record(false, 'unreachable')
    throw new Error('Could not reach the AI service (is it running?)')
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    // FastAPI errors carry a human-readable `detail` (e.g. 503 "model not loaded").
    const detail = await response
      .json()
      .then((body: unknown) => {
        const detail = (body as { detail?: unknown } | null)?.detail
        return typeof detail === 'string' ? detail : ''
      })
      .catch(() => '')
    record(false, `HTTP ${response.status}`)
    throw new Error(`AI service returned HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const result = (await response.json()) as FloorPlanResult
  record(result.status === 'completed', result.status === 'completed' ? null : 'detection failed', result)
  return result
}

// The AI service's GET /status (machine, GPU, weights, activity), as seen
// from this server, plus how the request travelled. For the System Status
// page; never throws.
export const getAiStatus = async () => {
  const started = Date.now()
  const secret = process.env.FASTAPI_SECRET
  let route = describeRoute(AI_SERVICE_ENDPOINT, null)
  if (!secret) {
    return { reachable: false, route, roundTripMs: null, error: 'FASTAPI_SECRET is not set on the server', status: null }
  }
  try {
    const response = await fetch(`${aiBaseUrl(AI_SERVICE_ENDPOINT)}/status`, {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(5000),
    })
    route = describeRoute(AI_SERVICE_ENDPOINT, response.headers.get('cf-ray'))
    const roundTripMs = Date.now() - started
    if (!response.ok) {
      const error =
        response.status === 401
          ? "The AI service rejected the server's secret (FASTAPI_SECRET differs)"
          : `The AI service answered HTTP ${response.status}`
      return { reachable: true, route, roundTripMs, error, status: null }
    }
    return { reachable: true, route, roundTripMs, error: null, status: await response.json() }
  } catch {
    return { reachable: false, route, roundTripMs: null, error: 'Could not reach the AI service', status: null }
  }
}
