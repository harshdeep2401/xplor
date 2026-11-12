import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

export const prisma = new PrismaClient()

// Connect at start-up so a wrong DATABASE_URL fails fast and loudly.
export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect()
    logger.info('Connected to PostgreSQL')
  } catch (error) {
    logger.fatal({ err: error }, 'Could not connect to the database')
    process.exit(1)
  }
}
