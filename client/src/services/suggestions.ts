import apiClient from './apiClient'
import type { CatalogAsset } from '../components/Editor/AssetList'
import type { SceneV1 } from '../editor/persist/sceneV1'

// POST /api/projects/:id/suggestions — mirrors server/services/recommender/types.ts.

export interface SuggestionPlacement {
  // Absolute scene-v1 position of the item's bottom-centre (metres).
  position: { x: number; y: number; z: number }
  rotationY: number
}

export interface FurnitureSuggestion {
  item: CatalogAsset
  score: number
  role: string
  reason: string
  placement: SuggestionPlacement
  alternatives: string[]
}

export interface RoomSuggestions {
  roomId: string
  name?: string
  type: string
  area: number
  suggestions: FurnitureSuggestion[]
}

export async function fetchSuggestions(
  projectId: string,
  scene: SceneV1,
): Promise<RoomSuggestions[]> {
  const { data } = await apiClient.post<{ rooms: RoomSuggestions[] }>(
    `/projects/${projectId}/suggestions`,
    { scene },
  )
  return data.rooms ?? []
}

const TYPE_NAMES: Record<string, string> = {
  living: 'Living room',
  bedroom: 'Bedroom',
  kitchen: 'Kitchen',
  dining: 'Dining room',
  bathroom: 'Bathroom',
  office: 'Office',
  hallway: 'Hallway',
  other: 'Room',
}

// "Kitchen · 12 m²", or "Bedroom (room 2) · 12 m²" for an unnamed room.
export function roomLabel(room: RoomSuggestions, index: number): string {
  const area = `${Math.round(room.area * 10) / 10} m²`
  if (room.name) return `${room.name} · ${area}`
  return `${TYPE_NAMES[room.type] ?? 'Room'} (room ${index + 1}) · ${area}`
}
