import type { RoomType, SceneV1, Vec3 } from '../converter/types'

// The recommender's view of the furniture catalog (one Asset row).
export interface CatalogItem {
  id: string
  name: string
  category: string | null
  fileUrl: string
  thumbnailUrl: string | null
  // Real-world size in metres: x = width, y = height, z = depth (front faces +z).
  dimensions: Vec3 | null
  roomTypes: string[]
  tags: string[]
  placement: 'floor' | 'wall' | 'surface' | 'ceiling'
}

// Where to put a suggested item: absolute scene-v1 position of its bottom-centre
// and its turn about the vertical axis (radians, = asset rotation.y).
export interface Placement {
  position: Vec3
  rotationY: number
}

export interface Suggestion {
  item: CatalogItem
  // Higher = more useful; comparable within one room.
  score: number
  // What the item is for in this room ("bed", "nightstand", …).
  role: string
  // One short sentence for the user ("A bedroom usually has a bed.").
  reason: string
  placement: Placement
  // Other catalog items that fill the same role, best first.
  alternatives: string[]
}

export interface RoomSuggestions {
  roomId: string
  name?: string
  type: RoomType
  area: number
  suggestions: Suggestion[]
}

export interface RecommendInput {
  scene: SceneV1
  catalog: CatalogItem[]
  // Only this room (default: every room).
  roomId?: string
  // Per room (default 8).
  limit?: number
}

// The plug-in point: any recommender (rules today, a learned model later) takes
// the scene + catalog and returns ranked, placeable suggestions per room.
export interface Recommender {
  readonly name: string
  recommend(input: RecommendInput): RoomSuggestions[]
}
