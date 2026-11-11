// Seed the furniture catalog (Asset table) from scripts/furniture-catalog.json.
//
//   npm run seed:assets            write to the database in DATABASE_URL
//   npm run seed:assets -- --dry   only check the catalog and the files
//
// Idempotent: each item is upserted under a stable id ("<source>-<slug>"), and
// rows from the same source that are no longer in the catalog are removed. No
// schema change: catalog details (size, room types, tags) go in Asset.metadata.
// Model files live in public/furniture/models, previews in public/furniture/previews,
// served at /static/furniture/... (see server.ts).
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { PrismaClient, type Prisma } from '@prisma/client'
import type { AssetMetadata } from '../services/catalog'

interface CatalogItem {
  slug: string
  name: string
  category: string
  // File names inside public/furniture/models and public/furniture/previews.
  model: string
  preview?: string
  // Real-world size in metres: x = width, y = height, z = depth.
  dimensions: { x: number; y: number; z: number }
  roomTypes: string[]
  tags?: string[]
  placement?: AssetMetadata['placement']
}

interface Catalog {
  source: string
  license: string
  items: CatalogItem[]
}

const ROOM_TYPES = new Set([
  'living',
  'bedroom',
  'kitchen',
  'dining',
  'bathroom',
  'office',
  'hallway',
  'other',
])
const FURNITURE_DIR = path.join(__dirname, '..', 'public', 'furniture')

function check(catalog: Catalog): string[] {
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
    const d = item.dimensions
    if (!d || !(d.x > 0 && d.y > 0 && d.z > 0) || Math.max(d.x, d.y, d.z) > 6) {
      problems.push(`${where}: dimensions must be positive metres (max 6 m)`)
    }
    for (const t of item.roomTypes) {
      if (!ROOM_TYPES.has(t)) problems.push(`${where}: unknown room type "${t}"`)
    }
  }
  return problems
}

async function main() {
  const dry = process.argv.includes('--dry')
  const catalog = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'furniture-catalog.json'), 'utf8'),
  ) as Catalog

  const problems = check(catalog)
  if (problems.length) {
    console.error(`Catalog has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`Catalog OK: ${catalog.items.length} items from ${catalog.source}.`)
  if (dry) return

  const prisma = new PrismaClient()
  try {
    const ids: string[] = []
    for (const item of catalog.items) {
      const id = `${catalog.source}-${item.slug}`
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
    console.log(`Seeded ${ids.length} assets; removed ${removed.count} no longer in the catalog.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
