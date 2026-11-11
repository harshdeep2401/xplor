import type { Request, RequestHandler } from 'express'
import helmet from 'helmet'
import { ipKeyGenerator, rateLimit, type Options } from 'express-rate-limit'
import { env } from '../config/env'
import { TooManyRequestsError } from '../errors'

// Security headers (helmet): no MIME sniffing, no framing, no X-Powered-By,
// HSTS, a strict CSP for anything rendered... Furniture models, thumbnails and
// uploads are loaded by the client from another origin (localhost:5173 →
// :5001, or the deployed domains), so resources may be read cross-origin; the
// CORS allow-list still decides which sites may call the API.
export const securityHeaders = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
})

// Requests are counted per signed-in user when known, else per IP address
// (behind a proxy, set TRUST_PROXY so the IP is the user's, not the proxy's).
function clientKey(req: Request): string {
  return req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? 'unknown')}`
}

export interface LimitOptions {
  // What is being limited, in the message: "sign-in attempts".
  what: string
  limit: number
  windowMs: number
  // Count only failed requests (status >= 400): e.g. wrong passwords.
  failuresOnly?: boolean
}

// A limiter that answers with the usual error shape: 429 RATE_LIMITED plus a
// Retry-After header. Standard RateLimit headers tell clients where they stand.
export function createLimiter({ what, limit, windowMs, failuresOnly = false }: LimitOptions) {
  const minutes = Math.ceil(windowMs / 60_000)
  const options: Partial<Options> = {
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clientKey,
    skipSuccessfulRequests: failuresOnly,
    skip: () => env.RATE_LIMIT === 'off',
    handler: (_req, res, next) => {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)))
      next(
        new TooManyRequestsError(
          `Too many ${what}. Please wait ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
        ),
      )
    },
  }
  return rateLimit(options)
}

const MINUTE = 60_000

// Everything under /api: generous, it only stops runaway clients and scripts.
export const apiLimiter: RequestHandler = createLimiter({
  what: 'requests',
  limit: 600,
  windowMs: 5 * MINUTE,
})

// Sign-in and sign-up: only failures count, so password guessing is slow while
// people who type their password right are never blocked.
export const authLimiter: RequestHandler = createLimiter({
  what: 'failed sign-in attempts',
  limit: 10,
  windowMs: 15 * MINUTE,
  failuresOnly: true,
})

// Floor-plan detection runs on the GPU machine: the most expensive request.
export const detectionLimiter: RequestHandler = createLimiter({
  what: 'floor-plan uploads',
  limit: 20,
  windowMs: 60 * MINUTE,
})

// Other uploads (models, textures, GLB exports on save).
export const uploadLimiter: RequestHandler = createLimiter({
  what: 'uploads',
  limit: 120,
  windowMs: 15 * MINUTE,
})
