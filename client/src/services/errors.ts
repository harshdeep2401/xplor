import axios from 'axios'

// Extract a human-readable message from an unknown thrown value (strict mode
// types catch variables as `unknown`). Falls back to the provided default.
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string } | undefined
    if (data?.message) return data.message
  }
  return fallback
}
