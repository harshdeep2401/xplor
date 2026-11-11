import { prisma } from '../config/db'
import type { CatalogItem } from './recommender/types'

// The furniture catalog = the Asset table (seeded by scripts/seedAssets.ts).
// Catalog-specific details live in Asset.metadata.
export interface AssetMetadata {
  // Real-world size in metres: x = width, y = height, z = depth.
  dimensions?: { x: number; y: number; z: number }
  // Room kinds the item suits (scene-v1 roomType values).
  roomTypes?: string[]
  tags?: string[]
  // Where the item normally goes: on the floor, against a wall, on a surface,
  // or hanging from the ceiling. Used when placing suggestions.
  placement?: CatalogItem['placement']
  source?: string
  license?: string
}

// It only changes when the seed script runs, so a short cache saves a query per
// suggestion request.
const TTL_MS = 60_000
let cached: { at: number; items: CatalogItem[] } | null = null

export async function listCatalog(): Promise<CatalogItem[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.items
  const rows = await prisma.asset.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  const items = rows.map((a): CatalogItem => {
    const meta = (a.metadata ?? {}) as AssetMetadata
    return {
      id: a.id,
      name: a.name,
      category: a.category,
      fileUrl: a.fileUrl,
      thumbnailUrl: a.thumbnailUrl,
      dimensions: meta.dimensions ?? null,
      roomTypes: meta.roomTypes ?? [],
      tags: meta.tags ?? [],
      placement: meta.placement ?? 'floor',
    }
  })
  cached = { at: Date.now(), items }
  return items
}
