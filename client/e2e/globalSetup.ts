import { execFileSync } from 'child_process'
import path from 'path'
import { serverEnv } from '../playwright.config'

// Before the run: the furniture catalog is in the test database, and users
// left over from an interrupted run are gone.
export default function globalSetup() {
  runDatabaseChore('prepare')
}

export function runDatabaseChore(command: 'prepare' | 'cleanup') {
  // node --import tsx: the server's TypeScript runner, no shell needed.
  execFileSync(process.execPath, ['--import', 'tsx', 'scripts/e2eDatabase.ts', command], {
    cwd: path.resolve(import.meta.dirname, '../../server'),
    env: { ...process.env, ...serverEnv },
    stdio: 'inherit',
  })
}
