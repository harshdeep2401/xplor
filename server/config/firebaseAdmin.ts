import { cert, initializeApp, type App } from 'firebase-admin/app'
import { getAuth, type Auth } from 'firebase-admin/auth'
import { env } from './env'

// Firebase Admin, used only to verify Google sign-in tokens. Started on first
// use, so the server (and its tests) run without Firebase credentials; Google
// sign-in then fails with a clear message instead of the whole server.
let app: App | null = null

export function firebaseAuth(): Auth {
  if (!app) {
    const projectId = env.FIREBASE_PROJECT_ID
    const clientEmail = env.FIREBASE_CLIENT_EMAIL
    const privateKey = env.FIREBASE_PRIVATE_KEY
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Google sign-in is not configured on this server.')
    }
    app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) })
  }
  return getAuth(app)
}
