// Load env vars FIRST — this side-effect import runs before the imports below,
// so process.env is populated before modules that read it at import time
// (e.g. config/firebaseAdmin) are evaluated.
import 'dotenv/config'

import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import path from 'path'
import { connectDB } from './config/db'
import authRoutes from './routes/authRoutes'
import projectRoutes from './routes/projectRoutes'
import jobRoutes from './routes/jobRoutes'

connectDB()

const app = express()

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}))
app.use(express.json())

// Local-disk uploads (floor plans etc.) served back out as static files.
// e.g. a file saved to /uploads/floor-plans/<userId>/<file> is reachable at
// http://localhost:5000/uploads/floor-plans/<userId>/<file>
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req: Request, res: Response) => {
  res.send('XPLOR API Running')
})

app.use('/api/auth', authRoutes)
app.use('/api/projects', projectRoutes)
app.use('/api/jobs', jobRoutes)

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
