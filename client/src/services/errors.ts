import axios from 'axios'
import { UnexpectedResponseError } from './apiSchemas'

// Every API error response has the shape { message, code, details? }
// (server/middleware/errorHandler.ts): `message` is meant for the user,
// `code` is stable and safe to branch on (e.g. 'SCENE_VERSION_CONFLICT').
interface ApiErrorBody {
  message?: string
  code?: string
  details?: unknown
}

function errorBody(err: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(err)) return undefined
  const data: unknown = err.response?.data
  return typeof data === 'object' && data !== null ? (data as ApiErrorBody) : undefined
}

// Extract a human-readable message from an unknown thrown value (strict mode
// types catch variables as `unknown`). Falls back to the provided default.
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof UnexpectedResponseError) return err.message
  const message = errorBody(err)?.message
  if (message) return message
  // No response at all: the request never reached the server.
  if (axios.isAxiosError(err) && !err.response) {
    return 'Cannot reach the server. Check that it is running and try again.'
  }
  return fallback
}

// The error's machine-readable code, if the server sent one.
export function getApiErrorCode(err: unknown): string | undefined {
  const code = errorBody(err)?.code
  return typeof code === 'string' ? code : undefined
}
