import fs from 'fs'
import os from 'os'
import path from 'path'
import dotenv from 'dotenv'
import { defineConfig } from 'vitest/config'

// Two kinds of tests:
//   unit         *.test.ts next to the code. No database, no network, no .env:
//                config is fixed below so results never depend on the machine.
//   integration  tests/integration/**. The whole app over HTTP (supertest)
//                against the TEST database: TEST_DATABASE_URL (CI) or
//                DATABASE_URL in server/.env.test (local). Skipped when neither
//                is set. Refuses to run against the database in server/.env.

const root = import.meta.dirname
const readEnvFile = (name: string) => {
  const file = path.join(root, name)
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {}
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || readEnvFile('.env.test').DATABASE_URL || ''

// Neon endpoints look like ep-name-123456(-pooler).region.aws.neon.tech; the
// pooled and direct hosts of one database share the ep-… part.
const endpoint = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return ''
  }
}
const mainDatabaseUrl = readEnvFile('.env').DATABASE_URL ?? ''
if (testDatabaseUrl && mainDatabaseUrl && endpoint(testDatabaseUrl) === endpoint(mainDatabaseUrl)) {
  throw new Error(
    'The test database is the same as the one in server/.env. Integration tests wipe ' +
      'their database, so point .env.test (or TEST_DATABASE_URL) at a separate Neon branch.',
  )
}

// Settings both kinds share. A non-existent DOTENV_CONFIG_PATH stops
// config/env.ts from loading the developer's .env into tests.
const sharedEnv = {
  NODE_ENV: 'test',
  DOTENV_CONFIG_PATH: path.join(root, '.env.does-not-exist'),
  JWT_SECRET: 'test-jwt-secret-for-tests-only-0123456789',
  FASTAPI_SECRET: 'test-ai-secret-for-tests-only-0123456789',
  FASTAPI_WEBHOOK_URL: 'http://ai.test.invalid/process-floor-plan',
  CORS_ORIGINS: 'http://localhost:5173',
}

const uploadDir = (kind: string) => path.join(os.tmpdir(), `xplor-${kind}-uploads-${process.pid}`)

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: [
        'app.ts',
        'config/**/*.ts',
        'controllers/**/*.ts',
        'errors/**/*.ts',
        'middleware/**/*.ts',
        'routes/**/*.ts',
        'schemas/**/*.ts',
        'services/**/*.ts',
      ],
      exclude: ['**/*.test.ts', 'config/db.ts'],
      reporter: ['text-summary', 'text', 'html'],
      // Floors at the level reached in step 4; raise them as tests are added.
      thresholds: { statements: 93, branches: 80, functions: 95, lines: 95 },
    },
    projects: [
      {
        test: {
          name: 'unit',
          include: ['**/*.test.ts'],
          exclude: ['node_modules/**', 'tests/integration/**'],
          env: {
            ...sharedEnv,
            // Never reached: unit tests mock the database.
            DATABASE_URL: 'postgresql://unit-tests@localhost:1/none',
            UPLOAD_DIR: uploadDir('unit'),
          },
        },
      },
      ...(testDatabaseUrl
        ? [
            {
              test: {
                name: 'integration',
                include: ['tests/integration/**/*.test.ts'],
                env: { ...sharedEnv, DATABASE_URL: testDatabaseUrl, UPLOAD_DIR: uploadDir('it') },
                globalSetup: ['tests/integration/globalSetup.ts'],
                setupFiles: ['tests/integration/setup.ts'],
                // One shared database: run files one at a time.
                fileParallelism: false,
                // Neon round trips (and a cold start on the first query).
                testTimeout: 30_000,
                hookTimeout: 60_000,
              },
            },
          ]
        : []),
    ],
  },
})
