// Seed the furniture catalog (Asset table) from scripts/furniture-catalog.json.
//
//   npm run seed:assets            write to the database in DATABASE_URL
//   npm run seed:assets -- --dry   only check the catalog and the files
//
// Idempotent: each item is upserted under a stable id ("<source>-<slug>"), and
// rows from the same source that are no longer in the catalog are removed. No
// schema change: catalog details (size, room types, tags) go in Asset.metadata.
// Model files live in public/furniture/models, previews in public/furniture/previews,
// served at /static/furniture/... (see app.ts). The work is in services/catalogSeed.ts.
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { catalogProblems, readCatalog, seedCatalog } from '../services/catalogSeed'

async function main() {
  const dry = process.argv.includes('--dry')
  const catalog = readCatalog()

  const problems = catalogProblems(catalog)
  if (problems.length) {
    console.error(`Catalog has ${problems.length} problem(s):\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
  console.log(`Catalog OK: ${catalog.items.length} items from ${catalog.source}.`)
  if (dry) return

  const prisma = new PrismaClient()
  try {
    const { seeded, removed } = await seedCatalog(prisma, catalog)
    console.log(`Seeded ${seeded} assets; removed ${removed} no longer in the catalog.`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
