// Database chores for the end-to-end tests (client/e2e), run against the TEST
// database given in DATABASE_URL:
//
//   tsx scripts/e2eDatabase.ts prepare   seed the furniture catalog if it's out of step
//   tsx scripts/e2eDatabase.ts cleanup   delete the users (and their projects) e2e created
//
// Called by client/e2e/globalSetup.ts and globalTeardown.ts; refuses to run
// without an explicit E2E=1 so it can't be pointed at a real database by accident.
import { PrismaClient } from '@prisma/client'
import { readCatalog, seedCatalog } from '../services/catalogSeed'

// Every e2e user's email looks like this (client/e2e/fixtures.ts).
const E2E_EMAIL = { startsWith: 'e2e-', endsWith: '@example.test' }

async function main() {
  const command = process.argv[2]
  if (process.env.E2E !== '1')
    throw new Error('Refusing to run: set E2E=1 (end-to-end tests only).')
  const prisma = new PrismaClient()
  try {
    if (command === 'prepare') {
      const catalog = readCatalog()
      const count = await prisma.asset.count({
        where: { id: { startsWith: `${catalog.source}-` } },
      })
      if (count !== catalog.items.length) await seedCatalog(prisma, catalog)
      // Leftovers from an interrupted run.
      await prisma.user.deleteMany({ where: { email: E2E_EMAIL } })
    } else if (command === 'cleanup') {
      const { count } = await prisma.user.deleteMany({ where: { email: E2E_EMAIL } })
      console.log(`e2e: removed ${count} test user(s)`)
    } else {
      throw new Error('Usage: e2eDatabase.ts prepare|cleanup')
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
