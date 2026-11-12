import jwt from 'jsonwebtoken'
import { env } from '../config/env'

// The app's session tokens (JWT, HS256, 7 days), signed with JWT_SECRET.
// Verification accepts only HS256, so a token can't pick a weaker algorithm.
const ALGORITHM = 'HS256'

export interface AppTokenPayload {
  id: string
  email: string
}

export function signAppToken(user: AppTokenPayload): string {
  return jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
    algorithm: ALGORITHM,
    expiresIn: '7d',
  })
}

// The token's payload, or null if it's forged, expired or malformed.
export function verifyAppToken(token: string): AppTokenPayload | null {
  try {
    const payload: unknown = jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM] })
    return typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { id?: unknown }).id === 'string'
      ? (payload as AppTokenPayload)
      : null
  } catch {
    return null
  }
}
