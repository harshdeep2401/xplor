import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchSuggestions, type RoomSuggestions } from '../../services/suggestions'
import { getApiErrorMessage } from '../../services/errors'
import type { SceneV1 } from '../../editor'

// Wait this long after the scene stops changing before asking again.
const REFRESH_DELAY_MS = 700

// Furniture suggestions for the scene as it is now (unsaved edits included),
// refreshed a moment after the scene stops changing. Only the newest request's
// answer is used.
export function useSuggestions({
  projectId,
  ready,
  objects,
  currentScene,
}: {
  projectId: string | undefined
  // False while the scene is loading.
  ready: boolean
  // Changes when the scene changes (triggers a refresh).
  objects: unknown
  currentScene: () => { scene: SceneV1 }
}) {
  // null = not loaded yet.
  const [rooms, setRooms] = useState<RoomSuggestions[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [roomId, setRoomId] = useState<string | null>(null)
  const latest = useRef(0)

  const refresh = useCallback(async () => {
    if (!projectId) return
    const ticket = ++latest.current
    setLoading(true)
    try {
      const result = await fetchSuggestions(projectId, currentScene().scene)
      if (ticket !== latest.current) return // a newer request won
      setRooms(result)
      setError(null)
    } catch (e) {
      if (ticket !== latest.current) return
      setError(getApiErrorMessage(e, 'Could not load suggestions.'))
    } finally {
      if (ticket === latest.current) setLoading(false)
    }
  }, [projectId, currentScene])

  useEffect(() => {
    if (!ready || !projectId) return
    const timer = window.setTimeout(() => void refresh(), REFRESH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [objects, ready, projectId, refresh])

  return { rooms, error, loading, roomId, setRoomId, refresh }
}
