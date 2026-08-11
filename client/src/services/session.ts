// Central place for the auth session (token + user) so every part of the app
// reads/writes it the same way. The app JWT is issued by the backend and lives
// in localStorage; it persists across reloads and browser restarts (7-day exp).

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

export interface SessionUser {
  id: string
  name?: string
  email?: string
  profileImage?: string | null
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionUser
  } catch {
    return null
  }
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// Decode the `exp` claim (seconds since epoch) from a JWT without a library.
// Returns null if the token is malformed.
function getTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

// True only when a non-expired token is present. An expired token is cleared
// so the app treats the user as logged out instead of leaving a broken session.
export function isAuthenticated(): boolean {
  const token = getToken()
  if (!token) return false

  const exp = getTokenExp(token)
  if (exp !== null && exp * 1000 <= Date.now()) {
    clearSession()
    return false
  }
  return true
}
