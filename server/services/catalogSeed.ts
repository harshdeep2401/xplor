// Loading and seeding the furniture catalog (scripts/furniture-catalog.json →
// the Asset table). Used by scripts/seedAssets.ts and by the integration tests,
// which need the real catalog in the test database.
import fs from 'fs'
import path from 'path'
import type { PrismaClient, Prisma } from '@prisma/client'
import { z } from 'zod'
import { assetMetadataSchema, dimensionsSchema, type AssetMetadata } from './catalog'

const catalogItemSchema = z.object({
  slug: z.string().regex(/^[A-Za-z0-9-]+$/, 'slug must be letters, digits and dashes'),
  name: z.string().min(1),
  category: z.string().min(1),
  // File names inside public/furniture/models and public/furniture/previews.
  model: z.string().min(1),
  preview: z.string().min(1).optional(),
  dimensions: dimensionsSchema,
  roomTypes: assetMetadataSchema.shape.roomTypes.unwrap(),
  tags: z.array(z.string()).optional(),
  placement: assetMetadataSchema.shape.placement,
})

const catalogSchema = z.object({
  source: z.string().regex(/^[a-z0-9-]+$/),
  license: z.string().min(1),
  items: z.array(catalogItemSchema),
})
export type Catalog = z.infer<typeof catalogSchema>

// services/ → server root.
const SERVER_ROOT = path.join(__dirname, '..')
export const CATALOG_FILE = path.join(SERVER_ROOT, 'scripts', 'furniture-catalog.json')
const FURNITURE_DIR = path.join(SERVER_ROOT, 'public', 'furniture')

// Read and check the catalog file. Throws with every schema problem listed.
export function readCatalog(file = CATALOG_FILE): Catalog {
  const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'))
  const parsed = catalogSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(`${path.basename(file)} is invalid:\n${z.prettifyError(parsed.error)}`)
  }
  return parsed.data
}

// Checks the schema can't express: unique slugs, and that the files exist.
export function catalogProblems(catalog: Catalog): string[] {
  const problems: string[] = []
  const slugs = new Set<string>()
  for (const item of catalog.items) {
    const where = `"${item.slug}"`
    if (slugs.has(item.slug)) problems.push(`${where}: duplicate slug`)
    slugs.add(item.slug)
    if (!fs.existsSync(path.join(FURNITURE_DIR, 'models', item.model))) {
      problems.push(`${where}: missing model file models/${item.model}`)
    }
    if (item.preview && !fs.existsSync(path.join(FURNITURE_DIR, 'previews', item.preview))) {
      problems.push(`${where}: missing preview previews/${item.preview}`)
    }
  }
  return problems
}

export const assetId = (catalog: Catalog, slug: string) => `${catalog.source}-${slug}`

// Upsert every item under its stable id ("<source>-<slug>") and remove rows of
// the same source that are no longer in the catalog. Idempotent.
export async function seedCatalog(
  prisma: PrismaClient,
  catalog: Catalog,
): Promise<{ seeded: number; removed: number }> {
  const ids: string[] = []
  for (const item of catalog.items) {
    const id = assetId(catalog, item.slug)
    ids.push(id)
    const metadata: AssetMetadata = {
      dimensions: item.dimensions,
      roomTypes: item.roomTypes,
      tags: item.tags ?? [],
      placement: item.placement ?? 'floor',
      source: catalog.source,
      license: catalog.license,
    }
    const data = {
      name: item.name,
      category: item.category,
      fileUrl: `/static/furniture/models/${item.model}`,
      thumbnailUrl: item.preview ? `/static/furniture/previews/${item.preview}` : null,
      metadata: metadata as unknown as Prisma.InputJsonValue,
    }
    await prisma.asset.upsert({ where: { id }, create: { id, ...data }, update: data })
  }
  const removed = await prisma.asset.deleteMany({
    where: { id: { startsWith: `${catalog.source}-`, notIn: ids } },
  })
  return { seeded: ids.length, removed: removed.count }
}
