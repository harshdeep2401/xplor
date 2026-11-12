import os from 'os'
import type { Request, Response } from 'express'
import { prisma } from '../config/db'
import { getAiStatus } from '../services/aiService'
import { recentAiCalls } from '../services/aiActivity'

const startedAt = new Date()

// GET /api/system/status
// One snapshot of the whole system for the System Status page: this API
// server, its database, and the AI service (where it runs and how the server
// reaches it). Logged-in users only; contains no secrets or full URLs.
const getSystemStatus = async (_req: Request, res: Response) => {
  const dbStarted = Date.now()
  const database = await prisma.$queryRaw`SELECT 1`
    .then(() => ({ ok: true, latencyMs: Date.now() - dbStarted }))
    .catch(() => ({ ok: false, latencyMs: null }))

  res.status(200).json({
    checkedAt: new Date().toISOString(),
    server: {
      ok: true,
      host: os.hostname(),
      platform: `${os.type()} ${os.release()}`,
      node: process.version,
      startedAt: startedAt.toISOString(),
      uptimeS: Math.round(process.uptime()),
    },
    database,
    ai: await getAiStatus(),
    recentCalls: recentAiCalls(),
  })
}

export { getSystemStatus }
