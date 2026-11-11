import { Box, Plus, RefreshCw, Sparkles } from 'lucide-react'
import Button from '../ui/Button'
import { resolveServerUrl } from '../../services/serverUrl'
import {
  roomLabel,
  type FurnitureSuggestion,
  type RoomSuggestions,
} from '../../services/suggestions'

interface SuggestionsPanelProps {
  rooms: RoomSuggestions[] | null
  loading: boolean
  error: string | null
  roomId: string | null
  onRoomChange: (roomId: string) => void
  onAdd: (s: FurnitureSuggestion) => void
  onRefresh: () => void
}

// Furniture suggestions for one room of the plan, each addable in one click
// (it lands on the spot the recommender picked).
export default function SuggestionsPanel({
  rooms,
  loading,
  error,
  roomId,
  onRoomChange,
  onAdd,
  onRefresh,
}: SuggestionsPanelProps) {
  const room = rooms?.find((r) => r.roomId === roomId) ?? rooms?.[0] ?? null

  return (
    <section aria-labelledby="suggestions-title" className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h3
          id="suggestions-title"
          className="flex items-center gap-2 text-lg font-semibold text-ink"
        >
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          Suggestions
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh suggestions"
          aria-label="Refresh suggestions"
          icon={
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          }
        />
      </div>

      {error ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-danger">{error}</p>
      ) : rooms === null ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">Looking at your rooms…</p>
      ) : rooms.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
          Suggestions need rooms: draw closed rooms in the 2D editor and convert to 3D. Drop a label
          like “Kitchen” in a room to tell XPLOR what it is.
        </p>
      ) : (
        <>
          <label className="mb-2 block text-xs text-muted" htmlFor="suggestions-room">
            Room
          </label>
          <select
            id="suggestions-room"
            value={room?.roomId ?? ''}
            onChange={(e) => onRoomChange(e.target.value)}
            className="mb-3 w-full rounded-lg border border-solid border-line bg-field/60 p-2 text-sm text-ink outline-none focus:border-primary"
          >
            {rooms.map((r, i) => (
              <option key={r.roomId} value={r.roomId}>
                {roomLabel(r, i)}
              </option>
            ))}
          </select>

          {room && room.suggestions.length === 0 ? (
            <p className="rounded-xl bg-surface-2 p-4 text-sm text-muted">
              Nothing to add here — this room has what it needs, or there's no free space left.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {room?.suggestions.map((s) => (
                <li
                  key={`${s.role}-${s.item.id}`}
                  className="flex items-center gap-2 rounded-lg border border-solid border-line bg-surface-2 p-2"
                >
                  {s.item.thumbnailUrl ? (
                    <img
                      src={resolveServerUrl(s.item.thumbnailUrl)}
                      alt=""
                      loading="lazy"
                      className="h-11 w-11 shrink-0 rounded bg-white/5 object-contain"
                    />
                  ) : (
                    <Box className="h-9 w-9 shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{s.item.name}</div>
                    <div className="text-xs text-muted">{s.reason}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => onAdd(s)}
                    disabled={loading}
                    aria-label={`Add ${s.item.name}`}
                    icon={<Plus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
