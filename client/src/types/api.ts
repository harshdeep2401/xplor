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
  | { status: 'completed'; wallCount: number }
  | { status: 'failed'; error: string }
