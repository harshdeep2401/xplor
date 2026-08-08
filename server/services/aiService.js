// Calls the FastAPI AI service's /process-floor-plan endpoint and returns
// its response. Talks over plain HTTP using Node's built-in fetch
// (Node 18+, no extra dependency needed).
//
// Sync by design for now: the caller awaits this and gets the full result
// back in one call. See ai-service/README.md ("Why sync, not async/webhook")
// for when/why that should change.

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const AI_SERVICE_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS) || 30000

// Throws only on transport-level problems (service unreachable, timeout,
// non-2xx HTTP status). A *detection* failure (bad image, 404'd file) is
// NOT thrown — it comes back as a normal { status: 'failed', error } object,
// matching the FastAPI contract, so callers should check result.status
// either way.
const processFloorPlan = async ({ jobId, projectId, floorPlanUrl }) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), AI_SERVICE_TIMEOUT_MS)

  try {
    const response = await fetch(`${AI_SERVICE_URL}/process-floor-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobId, projectId, floorPlanUrl }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`AI service returned HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`AI service did not respond within ${AI_SERVICE_TIMEOUT_MS}ms`)
    }
    throw new Error(`Could not reach AI service at ${AI_SERVICE_URL}: ${error.message}`)
  } finally {
    clearTimeout(timeout)
  }
}

module.exports = { processFloorPlan }