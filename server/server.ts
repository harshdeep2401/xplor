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

connectDB()

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

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}))
app.use(express.json())

// Local-disk uploads (floor plans etc.) served back out as static files.
// e.g. a file saved to /uploads/floor-plans/<userId>/<file> is reachable at
// http://localhost:5000/uploads/floor-plans/<userId>/<file>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req: Request, res: Response) => {
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

// JSON 404 for anything unmatched above.
app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: 'Not found' })
})

// Central error handler — the single place that formats error responses.
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ message: err.message || 'Internal server error' })
})

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
