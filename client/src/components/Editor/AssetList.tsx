import { useState, useEffect } from 'react'
import { Box } from 'lucide-react'
import apiClient from '../../services/apiClient'
import { getApiErrorMessage } from '../../services/errors'
import { resolveServerUrl } from '../../services/serverUrl'

// One item of the furniture catalog (GET /api/assets).
export interface CatalogAsset {
  id: string
  name: string
  category: string | null
  fileUrl: string
  thumbnailUrl: string | null
  // Real-world size in metres (x = width, y = height, z = depth).
  dimensions: { x: number; y: number; z: number } | null
  roomTypes: string[]
  tags: string[]
  placement: 'floor' | 'wall' | 'surface' | 'ceiling'
}

// Drag-and-drop payload type: the dragged item as JSON (read by the 3D editor).
export const ASSET_DRAG_TYPE = 'application/x-xplor-asset'

// Does the asset match every word of the search (name, category, tags, rooms)?
function matches(asset: CatalogAsset, words: string[]): boolean {
  const haystack = [asset.name, asset.category, ...asset.tags, ...asset.roomTypes]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return words.every((w) => haystack.includes(w))
}

function formatSize(d: CatalogAsset['dimensions']): string | null {
  if (!d) return null
  const cm = (m: number) => Math.round(m * 100)
  return `${cm(d.x)} × ${cm(d.z)} × ${cm(d.y)} cm`
}

export default function AssetList({ query = '' }: { query?: string }) {
  const [assets, setAssets] = useState<CatalogAsset[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get<{ assets: CatalogAsset[] }>('/assets')
      .then(({ data }) => {
        if (!cancelled) setAssets(data.assets ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(getApiErrorMessage(e, 'Could not load the furniture library.'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (isLoading) {
    return <div className="text-sm text-muted">Loading furniture…</div>
  }

  if (error) {
    return <div className="text-sm text-danger">{error}</div>
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = words.length ? assets.filter((a) => matches(a, words)) : assets

  if (shown.length === 0) {
    return (
      <div className="text-sm text-muted">
        {assets.length === 0
          ? 'The furniture library is empty.'
          : `Nothing matches “${query.trim()}”.`}
      </div>
    )
  }

  return (
    <div className="max-h-96 overflow-y-auto">
      <div className="space-y-2">
        {shown.map((asset) => {
          const size = formatSize(asset.dimensions)
          return (
            <div
              key={asset.id}
              className="flex cursor-grab items-center gap-2 rounded-lg border border-solid border-line bg-field/50 p-2 hover:border-primary/60"
              draggable="true"
              title="Drag into the scene"
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(asset))
                e.dataTransfer.effectAllowed = 'copy'
              }}
            >
              {asset.thumbnailUrl ? (
                <img
                  src={resolveServerUrl(asset.thumbnailUrl)}
                  alt=""
                  loading="lazy"
                  className="h-12 w-12 shrink-0 rounded bg-white/5 object-contain"
                />
              ) : (
                <Box className="h-10 w-10 shrink-0 text-muted" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <div className="truncate text-sm">{asset.name}</div>
                {size && <div className="text-xs text-muted">{size}</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
