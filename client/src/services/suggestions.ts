import apiClient from './apiClient'
import type { SceneV1 } from '../editor/persist/sceneV1'
import { parseResponse, suggestionsResponse, type RoomSuggestions } from './apiSchemas'

export type { FurnitureSuggestion, RoomSuggestions } from './apiSchemas'

// POST /api/projects/:id/suggestions: furniture for each room of `scene`.
export async function fetchSuggestions(
  projectId: string,
  scene: SceneV1,
): Promise<RoomSuggestions[]> {
  const { data } = await apiClient.post<unknown>(`/projects/${projectId}/suggestions`, {
    scene,
  })
  return parseResponse(suggestionsResponse, data, 'suggestions list').rooms
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
