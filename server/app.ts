// The Express app: middleware, routes and error handling, but no port and no
// database connection. server.ts starts it for real; tests drive it in-process
// (supertest), so every route is exercised exactly as the client calls it.
import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { env } from './config/env'
import { prisma } from './config/db'
import authRoutes from './routes/authRoutes'
import projectRoutes from './routes/projectRoutes'
import jobRoutes from './routes/jobRoutes'
import systemRoutes from './routes/systemRoutes'
import assetRoutes from './routes/assetRoutes'
import { errorHandler, notFoundHandler } from './middleware/errorHandler'
import { STORAGE_ROOT } from './services/storage'

export function createApp() {
  const app = express()

  // Allow-list from CORS_ORIGINS (config/env.ts; local dev origins by default).
  // No wildcard in production — set CORS_ORIGINS on the host.
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }))
  app.use(express.json())

  // Local-disk uploads (floor plans etc.) served back out as static files.
  // e.g. a file saved under floor-plans/<userId>/<file> is reachable at
  // /uploads/floor-plans/<userId>/<file>
  app.use('/uploads', express.static(STORAGE_ROOT))

  // Files that ship with the app, e.g. the furniture catalog's models and
  // thumbnails at /static/furniture/<file> (listed by GET /api/assets).
  app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }))

  app.get('/', (_req: Request, res: Response) => {
    res.send('XPLOR API Running')
  })

  // Liveness — the process is up and accepting requests.
  app.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' })
  })

  // Readiness — can we actually reach the database?
  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.status(200).json({ status: 'ready' })
    } catch {
      res.status(503).json({ status: 'not ready' })
    }
  })

  app.use('/api/auth', authRoutes)
  app.use('/api/projects', projectRoutes)
  app.use('/api/jobs', jobRoutes)
  app.use('/api/system', systemRoutes)
  app.use('/api/assets', assetRoutes)

  // Unmatched routes → 404, then every error → one JSON shape
  // ({ message, code, details? }; middleware/errorHandler.ts).
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
