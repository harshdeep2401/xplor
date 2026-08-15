// Calls the FastAPI AI service's /process-floor-plan endpoint and returns
// its response. Talks over plain HTTP using Node's built-in fetch
// (Node 18+, no extra dependency needed).
//
// Sync by design for now: the caller awaits this and gets the full result
// back in one call. See ai-service/README.md ("Why sync, not async/webhook")
// for when/why that should change.

// FASTAPI_WEBHOOK_URL is the *full* endpoint (e.g. http://127.0.0.1:8000/process-floor-plan),
// so we call it as-is and do NOT append a path. Falls back to the local default.
const AI_SERVICE_ENDPOINT =
  process.env.FASTAPI_WEBHOOK_URL || 'http://localhost:8000/process-floor-plan'
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 30000

interface ProcessFloorPlanArgs {
  jobId: string
  projectId: string
  floorPlanUrl: string
}

// Shape of the FastAPI response. detection/metadata are passed straight through
// to Prisma JSON columns, so they're left loose here.
export interface FloorPlanResult {
  status: string
  detection?: any
  metadata?: any
  error?: string
}

// Throws only on transport-level problems (service unreachable, timeout,
// non-2xx HTTP status). A *detection* failure (bad image, 404'd file) is
// NOT thrown — it comes back as a normal { status: 'failed', error } object,
// matching the FastAPI contract, so callers should check result.status
// either way.
export const processFloorPlan = async ({
  jobId,
  projectId,
  floorPlanUrl,
}: ProcessFloorPlanArgs): Promise<FloorPlanResult> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS)

  try {
    const response = await fetch(AI_SERVICE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, projectId, floorPlanUrl }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`AI service returned HTTP ${response.status}`)
    }

    return (await response.json()) as FloorPlanResult
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`AI service did not respond within ${AI_SERVICE_TIMEOUT_MS}ms`)
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not reach AI service at ${AI_SERVICE_ENDPOINT}: ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}
