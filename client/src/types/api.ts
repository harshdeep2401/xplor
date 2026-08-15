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
