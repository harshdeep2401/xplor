const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const connectDB = async () => {
  try {
    await prisma.$connect()
    console.log(`PostgreSQL Connected via Prisma`)
  } catch (error) {
    console.log('Database Error:', error)
    process.exit(1)
  }
}

module.exports = { connectDB, prisma }
