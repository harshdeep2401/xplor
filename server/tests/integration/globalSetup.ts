// Runs once before all integration tests (in the main process, so it gets the
// test settings from the project config rather than process.env).
import fs from 'fs'
import { PrismaClient } from '@prisma/client'
import type { TestProject } from 'vitest/node'
import { readCatalog, seedCatalog } from '../../services/catalogSeed'

export default async function setup(project: TestProject) {
  const { DATABASE_URL, UPLOAD_DIR } = project.config.env as Record<string, string>
  const prisma = new PrismaClient({ datasourceUrl: DATABASE_URL })
  try {
    // Suggestions and the asset list need the real furniture catalog. Seed it
    // only when it's out of step (seeding is ~120 round trips).
    const catalog = readCatalog()
    const rows = await prisma.asset.findMany({
      where: { id: { startsWith: `${catalog.source}-` } },
      select: { id: true, name: true },
    })
    const names = new Map(rows.map((r) => [r.id, r.name]))
    const inStep =
      rows.length === catalog.items.length &&
      catalog.items.every((i) => names.get(`${catalog.source}-${i.slug}`) === i.name)
    if (!inStep) await seedCatalog(prisma, catalog)
  } finally {
    await prisma.$disconnect()
  }

  return () => {
    fs.rmSync(UPLOAD_DIR, { recursive: true, force: true })
  }
}
