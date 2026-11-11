// What the System Status page shows about the AI service: how calls reach it
// (direct, or through the Cloudflare Tunnel) and a log of recent calls.
// Kept in memory only (resets when the server restarts), and holds timings
// and ids, never images, detections or secrets.

export interface AiRoute {
  // How the server reaches the AI service.
  via: 'cloudflare-tunnel' | 'direct'
  // Host name only (no path, no secret), e.g. "abc-def.trycloudflare.com".
  host: string
  // Cloudflare's id for one request; the suffix after "-" is the Cloudflare
  // data centre that carried it (e.g. "8f1c2a3b4c5d6e7f-SIN" -> SIN).
  cfRay: string | null
  cfColo: string | null
}

export interface AiCall extends AiRoute {
  at: string // ISO time the call started
  jobId: string
  ok: boolean
  httpStatus: number | null
  roundTripMs: number
  // Time spent on the AI machine itself (from the detection metadata).
  processingMs: number | null
  method: string | null // detector that ran, e.g. "unet-mitb3"
  error: string | null
}

import { logger } from '../config/logger'

const MAX_CALLS = 25
const calls: AiCall[] = []

export const recordAiCall = (call: AiCall) => {
  calls.unshift(call)
  calls.length = Math.min(calls.length, MAX_CALLS)
  const route =
    call.via === 'cloudflare-tunnel'
      ? `Cloudflare tunnel${call.cfColo ? ` (${call.cfColo})` : ''}`
      : 'direct'
  logger[call.ok ? 'info' : 'warn'](
    {
      ai: {
        jobId: call.jobId,
        ok: call.ok,
        via: call.via,
        cfColo: call.cfColo,
        httpStatus: call.httpStatus,
        roundTripMs: call.roundTripMs,
        processingMs: call.processingMs,
        error: call.error,
      },
    },
    `AI call for job ${call.jobId}: ${call.ok ? 'ok' : `failed (${call.error})`} via ${route} in ${call.roundTripMs} ms` +
      (call.processingMs != null ? ` (${call.processingMs} ms on the AI machine)` : ''),
  )
}

export const recentAiCalls = (): AiCall[] => [...calls]

// Base URL of the AI service, from its full detection endpoint
// ("https://x.trycloudflare.com/process-floor-plan" -> "https://x.trycloudflare.com").
export const aiBaseUrl = (endpoint: string): string => {
  const url = new URL(endpoint)
  url.pathname = url.pathname.replace(/\/process-floor-plan\/?$/, '')
  url.search = ''
  return url.toString().replace(/\/$/, '')
}

// How a response got here. Cloudflare stamps every proxied response with a
// CF-Ray header, so its presence proves the call went through Cloudflare.
export const describeRoute = (endpoint: string, cfRay: string | null): AiRoute => {
  const host = new URL(endpoint).hostname
  const tunnel = cfRay !== null || host.endsWith('.trycloudflare.com')
  const colo = cfRay?.includes('-') ? cfRay.split('-').pop()!.toUpperCase() : null
  return { via: tunnel ? 'cloudflare-tunnel' : 'direct', host, cfRay, cfColo: colo }
}
