// Do the migrations in prisma/migrations build exactly prisma/schema.prisma?
//
//   npm run db:check-migrations
//
// Prisma replays the migrations into a throwaway, empty Postgres schema
// ("migration_check") on the TEST database and compares the result with
// schema.prisma. Fails (exit 1) on any difference — e.g. a schema change
// committed without its migration. The throwaway schema is dropped afterwards.
//
// The test database comes from TEST_DATABASE_URL or server/.env.test, never
// server/.env. Neon's *direct* host is used, not the pooler: Prisma switches
// the connection to the throwaway schema, and a pooler would keep that setting
// on connections it hands to others.
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

const root = path.join(__dirname, '..')
const readEnv = (name: string) => {
  const file = path.join(root, name)
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {}
}

const testUrl = process.env.TEST_DATABASE_URL || readEnv('.env.test').DATABASE_URL
if (!testUrl) {
  console.error('No test database: set TEST_DATABASE_URL or DATABASE_URL in server/.env.test.')
  process.exit(1)
}
const endpoint = (url: string) => new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
const mainUrl = readEnv('.env').DATABASE_URL
if (mainUrl && endpoint(mainUrl) === endpoint(testUrl)) {
  console.error('Refusing: the test database is the one in server/.env.')
  process.exit(1)
}

const direct = new URL(testUrl)
direct.hostname = direct.hostname.replace('-pooler', '')
const shadow = new URL(direct)
shadow.searchParams.set('schema', 'migration_check')

async function main() {
  let failed = false
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, 'node_modules', 'prisma', 'build', 'index.js'),
        'migrate',
        'diff',
        '--from-migrations',
        'prisma/migrations',
        '--to-schema-datamodel',
        'prisma/schema.prisma',
        '--shadow-database-url',
        shadow.toString(),
        '--script',
        '--exit-code',
      ],
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
    )
    console.log('Migrations match schema.prisma.')
  } catch (err) {
    failed = true
    const out = (err as { stdout?: Buffer }).stdout?.toString() ?? ''
    console.error('Migrations do NOT match schema.prisma. Missing SQL:\n' + out)
    console.error('Create a migration for your schema change: see docs/05 §7.')
  } finally {
    const prisma = new PrismaClient({ datasourceUrl: direct.toString() })
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS "migration_check" CASCADE')
    await prisma.$disconnect()
  }
  process.exit(failed ? 1 : 0)
}

void main()
