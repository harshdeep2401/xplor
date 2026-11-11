// Entry point: validate the configuration, connect to the database and listen.
// The app itself (routes, middleware) is built in app.ts.
//
// Load and validate the configuration FIRST: a bad .env stops the server here,
// with a message naming the variable, before anything else starts.
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDB } from './config/db'
import { createApp } from './app'

if (env.JWT_SECRET.length < 32) {
  logger.warn('JWT_SECRET is shorter than 32 characters; production will refuse to start.')
}

void connectDB()

createApp().listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, `Server running on port ${env.PORT}`)
})

// Crashes that escape every handler: log them before the process goes down.
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection')
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception; shutting down')
  process.exit(1)
})
