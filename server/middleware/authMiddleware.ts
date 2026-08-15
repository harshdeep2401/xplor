import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/db'

interface AppTokenPayload {
  id: string
  email: string
}

export const protect = async (req: Request, res: Response, next: NextFunction) => {
  let token: string | undefined

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1]

      // Verify token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET as string
      ) as AppTokenPayload

      // Get user from the token
      req.user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          profileImage: true,
        },
      }) ?? undefined

      if (!req.user) {
        return res.status(401).json({ message: 'Not authorized, user not found' })
      }

      next()
    } catch (error) {
      console.error(error)
      res.status(401).json({ message: 'Not authorized, token failed' })
    }
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' })
  }
}
