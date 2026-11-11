import admin from 'firebase-admin'
import { env } from './env'

// Firebase Admin, used only to verify Google sign-in tokens. Started on first
// use, so the server (and its tests) run without Firebase credentials; Google
// sign-in then fails with a clear message instead of the whole server.
let app: admin.app.App | null = null

export function firebaseAuth(): admin.auth.Auth {
  if (!app) {
    const projectId = env.FIREBASE_PROJECT_ID
    const clientEmail = env.FIREBASE_CLIENT_EMAIL
    const privateKey = env.FIREBASE_PRIVATE_KEY
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Google sign-in is not configured on this server.')
    }
    app = admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    })
  }
  return app.auth()
}
