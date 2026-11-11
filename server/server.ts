// Load env vars FIRST — this side-effect import runs before the imports below,
// so process.env is populated before modules that read it at import time
// (e.g. config/firebaseAdmin) are evaluated.
import 'dotenv/config'

import express from 'express'
import type { Request, Response, NextFunction } from 'express'
import cors from 'cors'
import path from 'path'
import { connectDB, prisma } from './config/db'
import authRoutes from './routes/authRoutes'
import projectRoutes from './routes/projectRoutes'
import jobRoutes from './routes/jobRoutes'
import systemRoutes from './routes/systemRoutes'
import assetRoutes from './routes/assetRoutes'
import multer from 'multer'
import { UploadError } from './middleware/uploadMiddleware'

void connectDB()

const app = express()

// Allow-list from env (comma-separated); falls back to local dev origins.
// No wildcard in production — set CORS_ORIGINS on the host.
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175'
)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
)
app.use(express.json())

// Local-disk uploads (floor plans etc.) served back out as static files.
// e.g. a file saved to /uploads/floor-plans/<userId>/<file> is reachable at
// http://localhost:5000/uploads/floor-plans/<userId>/<file>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

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

// JSON 404 for anything unmatched above.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' })
})

// Central error handler — the single place that formats error responses.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // Rejected uploads: wrong file type (UploadError) or too large (multer).
  if (err instanceof UploadError || err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message })
  }
  console.error(err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
