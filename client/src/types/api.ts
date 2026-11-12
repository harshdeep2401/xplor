// Shapes returned by the backend API. The server adds `_id` (mirror of `id`)
// to project responses for frontend compatibility, so both are present.

export interface Project {
  id: string
  _id?: string
  name: string
  type: '2d' | '3d'
  canvas?: unknown
  canvasWidth?: number
  canvasHeight?: number
  status?: string
  floorPlanUrl?: string | null
  thumbnailUrl?: string | null
  createdAt?: string
  updatedAt: string
}

// POST /projects/:id/upload-floor-plan. Detection runs synchronously, so `job`
// is already completed or failed when this returns.
export interface FloorPlanUploadResponse {
  project: Project
  job: {
    id: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    errorMessage?: string | null
    metadata?: { wallCount?: number; roomCount?: number; method?: string } | null
  }
}

// Outcome of a floor-plan import, handed to the 2D editor via router state so it
// can tell the user what happened.
export type ImportResult =
  { status: 'completed'; wallCount: number } | { status: 'failed'; error: string }

// GET /api/system/status — the System Status page (pages/SystemStatus.tsx).
export interface AiRoute {
  via: 'cloudflare-tunnel' | 'direct'
  host: string
  cfRay: string | null
  cfColo: string | null
}

export interface AiCall extends AiRoute {
  at: string
  jobId: string
  ok: boolean
  httpStatus: number | null
  roundTripMs: number
  processingMs: number | null
  method: string | null
  error: string | null
}

export interface SystemStatus {
  checkedAt: string
  server: {
    ok: boolean
    host: string
    platform: string
    node: string
    startedAt: string
    uptimeS: number
  }
  database: { ok: boolean; latencyMs: number | null }
  ai: {
    reachable: boolean
    route: AiRoute
    roundTripMs: number | null
    error: string | null
    status: {
      ready: boolean
      error: string | null
      host: string
      runningIn: 'docker' | 'local'
      startedAt: string
      uptimeS: number
      detector: string
      device: string | null
      gpu: {
        name: string
        memoryUsedMb: number
        memoryTotalMb: number
        modelMemoryMb: number
      } | null
      model: { method: string; file: string; sizeMb: number; sha256: string } | null
      detectionsServed: number
      lastDetectionMs: number | null
      lastDetectionAt: string | null
    } | null
  }
  recentCalls: AiCall[]
}
