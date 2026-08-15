// Augment Express's Request with the `user` attached by the `protect`
// middleware after it verifies the JWT.
import 'express'

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        name: string
        email: string
        profileImage?: string | null
      }
    }
  }
}

export {}
