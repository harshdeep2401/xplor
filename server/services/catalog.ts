import { z } from 'zod'
import { prisma } from '../config/db'
import type { CatalogItem } from './recommender/types'

// The furniture catalog = the Asset table (seeded by scripts/seedAssets.ts).
// Catalog-specific details live in Asset.metadata, in this shape.

export const ROOM_TYPES = [
  'living',
  'bedroom',
  'kitchen',
  'dining',
  'bathroom',
  'office',
  'hallway',
  'other',
] as const

// Real-world size in metres: x = width, y = height, z = depth (at most 6 m).
const metres = z.number().positive().max(6)
export const dimensionsSchema = z.object({ x: metres, y: metres, z: metres })

export const assetMetadataSchema = z.object({
  dimensions: dimensionsSchema.optional(),
  // Room kinds the item suits (scene-v1 roomType values).
  roomTypes: z.array(z.enum(ROOM_TYPES)).optional(),
  tags: z.array(z.string()).optional(),
  // Where the item normally goes: on the floor, against a wall, on a surface,
  // or hanging from the ceiling. Used when placing suggestions.
  placement: z.enum(['floor', 'wall', 'surface', 'ceiling']).optional(),
  source: z.string().optional(),
  license: z.string().optional(),
})
export type AssetMetadata = z.infer<typeof assetMetadataSchema>

// It only changes when the seed script runs, so a short cache saves a query per
// suggestion request.
const TTL_MS = 60_000
let cached: { at: number; items: CatalogItem[] } | null = null

export async function listCatalog(): Promise<CatalogItem[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.items
  const rows = await prisma.asset.findMany({ orderBy: [{ category: 'asc' }, { name: 'asc' }] })
  const items = rows.flatMap((a): CatalogItem[] => {
    const parsed = assetMetadataSchema.safeParse(a.metadata ?? {})
    if (!parsed.success) {
      // A hand-edited row shouldn't take the whole catalog down; skip it.
      console.warn(`Skipping catalog item ${a.id}: ${z.prettifyError(parsed.error)}`)
      return []
    }
    const meta = parsed.data
    const item: CatalogItem = {
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
    return [item]
  })
  cached = { at: Date.now(), items }
  return items
}
