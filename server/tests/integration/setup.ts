// Runs in each integration test file. Every test starts from an empty database
// (the furniture catalog and subscription plans are kept: they're reference
// data, not something a test creates).
import { afterAll, beforeEach } from 'vitest'
import { prisma } from '../../config/db'

const TABLES = [
  'User',
  'Project',
  'Job',
  'Scene',
  'VrOutput',
  'EditorSession',
  'AuditLog',
  'UserAsset',
  'UserSubscription',
]

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  )
})

afterAll(async () => {
  await prisma.$disconnect()
})
