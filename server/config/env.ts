// The server's configuration, read once from the environment and validated.
// Every variable the server uses is declared here, so a missing or malformed
// value stops the server at start-up with a clear message, instead of failing
// later on the first request that needs it. Import `env` rather than reading
// process.env anywhere else.
import 'dotenv/config'
import path from 'path'
import { z } from 'zod'

const DEV_ORIGINS =
  'http://localhost:3000,http://localhost:5173,http://localhost:5174,http://localhost:5175'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(5001),
    // Comma-separated allow-list of frontend origins.
    CORS_ORIGINS: z
      .string()
      .default(DEV_ORIGINS)
      .transform((s) =>
        s
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      ),

    DATABASE_URL: z.string({ error: 'DATABASE_URL is required' }).min(1),
    JWT_SECRET: z.string({ error: 'JWT_SECRET is required' }).min(1),

    // Google sign-in (Firebase Admin). Optional: without them Google sign-in is
    // switched off and everything else works.
    FIREBASE_PROJECT_ID: z.string().optional(),
    FIREBASE_CLIENT_EMAIL: z.string().optional(),
    // .env files can't hold real newlines, so the key comes with "\n" escapes.
    FIREBASE_PRIVATE_KEY: z
      .string()
      .optional()
      .transform((k) => k?.replace(/\\n/g, '\n')),

    // Where uploads are stored on local disk (until storage moves to R2).
    // Relative paths are from the server folder.
    UPLOAD_DIR: z
      .string()
      .default('uploads')
      .transform((dir) => path.resolve(__dirname, '..', dir)),

    // How many most-recent GLB exports to keep per project.
    GLB_KEEP: z.coerce.number().int().min(1).default(2),

    // The AI service's full endpoint, path included.
    FASTAPI_WEBHOOK_URL: z.url().default('http://localhost:8000/process-floor-plan'),
    // Shared secret with the AI service. Optional in development (detection is
    // then unavailable); required in production.
    FASTAPI_SECRET: z.string().min(32, 'must be at least 32 characters').optional(),
    AI_SERVICE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

    // Which furniture recommender to use (services/recommender).
    RECOMMENDER: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return
    const demand = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
    }
    const longSecret = env.JWT_SECRET.length >= 32
    demand(longSecret, 'JWT_SECRET', 'must be at least 32 characters in production')
    demand(Boolean(env.FASTAPI_SECRET), 'FASTAPI_SECRET', 'is required in production')
    demand(!env.CORS_ORIGINS.includes('*'), 'CORS_ORIGINS', 'must not contain * in production')
  })

export type Env = z.infer<typeof schema>

// Parse a set of variables (process.env by default). Blank values count as
// unset, so `KEY=` in a .env file falls back to the default.
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const present = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''))
  const result = schema.safeParse(present)
  if (!result.success) {
    throw new Error(`Invalid server configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

export const env = loadEnv()

if (env.NODE_ENV === 'development' && env.JWT_SECRET.length < 32) {
  // eslint-disable-next-line no-console -- runs before the logger exists
  console.warn('JWT_SECRET is shorter than 32 characters; production will refuse to start.')
}
