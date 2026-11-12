import fs from 'fs'
import { serverEnv } from '../playwright.config'
import { runDatabaseChore } from './globalSetup'

// After the run: delete the e2e users (their projects go with them) and the
// uploaded files.
export default function globalTeardown() {
  runDatabaseChore('cleanup')
  fs.rmSync(serverEnv.UPLOAD_DIR, { recursive: true, force: true })
}
