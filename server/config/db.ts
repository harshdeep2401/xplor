import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect()
    console.log('PostgreSQL Connected via Prisma')
  } catch (error) {
    console.log('Database Error:', error)
    process.exit(1)
  }
}
