// End-to-end tests: the real client and API in a real browser, against the
// TEST database (never the one in server/.env). Playwright starts both servers
// on their own ports, so it doesn't clash with `npm run dev`.
//
//   npm run e2e            headless
//   npm run e2e:headed     watch it happen
//   npm run e2e:report     open the last HTML report
//
// The test database comes from TEST_DATABASE_URL (CI) or DATABASE_URL in
// server/.env.test (local), like the server's integration tests.
import fs from 'fs'
import os from 'os'
import path from 'path'
import { defineConfig, devices } from '@playwright/test'

const serverDir = path.resolve(import.meta.dirname, '../server')

const readEnvFile = (name: string): Record<string, string> => {
  const file = path.join(serverDir, name)
  if (!fs.existsSync(file)) return {}
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => [m[1], m[2]]),
  )
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL || readEnvFile('.env.test').DATABASE_URL
if (!testDatabaseUrl) {
  throw new Error('No test database: set TEST_DATABASE_URL or DATABASE_URL in server/.env.test.')
}
const endpoint = (url: string) => {
  try {
    return new URL(url).hostname.split('.')[0].replace(/-pooler$/, '')
  } catch {
    return ''
  }
}
const mainDatabaseUrl = readEnvFile('.env').DATABASE_URL
if (mainDatabaseUrl && endpoint(mainDatabaseUrl) === endpoint(testDatabaseUrl)) {
  throw new Error('The e2e database is the one in server/.env. Point it at the Neon test branch.')
}

export const API_PORT = 5101
export const APP_PORT = 5273
export const API_URL = `http://localhost:${API_PORT}/api`

// Settings for the API server under test; also used by globalSetup/Teardown.
export const serverEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'warn',
  // Don't load the developer's server/.env.
  DOTENV_CONFIG_PATH: path.join(serverDir, '.env.does-not-exist'),
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'e2e-jwt-secret-for-tests-only-0123456789',
  PORT: String(API_PORT),
  CORS_ORIGINS: `http://localhost:${APP_PORT}`,
  // Each test signs up its own users from one address.
  RATE_LIMIT: 'off',
  UPLOAD_DIR: path.join(os.tmpdir(), 'xplor-e2e-uploads'),
  // Floor-plan detection is faked in the tests that need it; nothing real is called.
  FASTAPI_WEBHOOK_URL: 'http://127.0.0.1:9/process-floor-plan',
  E2E: '1',
}

export default defineConfig({
  testDir: './e2e',
  // One shared database and real servers: run tests one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      // Locally: the Chrome already installed. CI installs Playwright's Chromium.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(process.env.CI ? {} : { channel: 'chrome' }),
      },
    },
  ],
  webServer: [
    {
      command: 'npm start',
      cwd: serverDir,
      url: `http://localhost:${API_PORT}/ready`,
      env: serverEnv,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: `npx vite --port ${APP_PORT} --strictPort`,
      url: `http://localhost:${APP_PORT}`,
      env: { VITE_API_URL: API_URL },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
})
