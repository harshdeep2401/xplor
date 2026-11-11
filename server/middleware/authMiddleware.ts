import type { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/db'
import { env } from '../config/env'
import { UnauthorizedError } from '../errors'

// Signed into the token by authController.signAppToken.
interface AppTokenPayload {
  id: string
  email: string
}

const isTokenPayload = (value: unknown): value is AppTokenPayload =>
  typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'

// Requires `Authorization: Bearer <token>`; sets req.user. Every failure is a
// 401 (thrown; the client signs the user out on it).
export const protect = async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : ''
  if (!token) throw new UnauthorizedError('Please sign in to continue.', 'NO_TOKEN')

  let payload: unknown
  try {
    payload = jwt.verify(token, env.JWT_SECRET)
  } catch {
    throw new UnauthorizedError('Your session has expired. Please sign in again.', 'INVALID_TOKEN')
  }
  if (!isTokenPayload(payload)) {
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
