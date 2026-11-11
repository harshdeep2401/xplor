import type { NextFunction, Request, Response } from 'express'
import { prisma } from '../config/db'
import { UnauthorizedError } from '../errors'
import { verifyAppToken } from '../services/tokens'

// Requires `Authorization: Bearer <token>`; sets req.user. Every failure is a
// 401 (thrown; the client signs the user out on it).
export const protect = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) throw new UnauthorizedError('Please sign in to continue.', 'NO_TOKEN')

  const payload = verifyAppToken(token)
  if (!payload) {
    throw new UnauthorizedError('Your session has expired. Please sign in again.', 'INVALID_TOKEN')
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { id: true, name: true, email: true, profileImage: true },
  })
  if (!user) throw new UnauthorizedError('Your account no longer exists.', 'USER_NOT_FOUND')

  req.user = user
  next()
}
