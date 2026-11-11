import type { Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../config/db'
import { env } from '../config/env'
import { firebaseAuth } from '../config/firebaseAdmin'
import {
  BadRequestError,
  ConflictError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../errors'
import type { GoogleLoginBody, LoginBody, RegisterBody } from '../schemas/auth'

// Bodies are checked by schemas/auth.ts before these run; failures are thrown
// and answered by middleware/errorHandler.ts.

const signAppToken = (user: { id: string; email: string }) =>
  jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, { expiresIn: '7d' })

// The user fields sent to the client after signing in.
const publicUser = (user: {
  id: string
  name: string
  email: string
  profileImage?: string | null
}) => ({ id: user.id, name: user.name, email: user.email, profileImage: user.profileImage })

// POST /api/auth/register
const registerUser = async (req: Request<object, unknown, RegisterBody>, res: Response) => {
  const { name, email, countryCode, phone, password } = req.body

  const existingUser = await prisma.user.findUnique({ where: { email } })
  if (existingUser) {
    throw new ConflictError('An account with this email already exists.', 'EMAIL_TAKEN')
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      countryCode,
      phone,
      password: await bcrypt.hash(password, 10),
      authProvider: 'local',
    },
  })

  res.status(201).json({
    message: 'Account created successfully',
    token: signAppToken(user),
    user: publicUser(user),
  })
}

// POST /api/auth/google-login  Body: { token } (a Firebase ID token)
const googleLogin = async (req: Request<object, unknown, GoogleLoginBody>, res: Response) => {
  let auth
  try {
    auth = firebaseAuth()
  } catch {
    throw new ServiceUnavailableError(
      'Google sign-in is not available right now. Sign in with your email instead.',
      'GOOGLE_SIGN_IN_UNAVAILABLE',
    )
  }

  let decodedToken
  try {
    decodedToken = await auth.verifyIdToken(req.body.token)
  } catch {
    throw new UnauthorizedError('Google sign-in failed. Please try again.', 'INVALID_GOOGLE_TOKEN')
  }

  const { uid, email, name, picture } = decodedToken
  if (!email) {
    throw new BadRequestError(
      'Your Google account has no email address we can use.',
      'GOOGLE_EMAIL_MISSING',
    )
  }

  let user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    user = await prisma.user.create({
      data: {
        name: typeof name === 'string' && name ? name : email,
        email,
        googleId: uid,
        profileImage: picture,
        authProvider: 'google',
      },
    })
  } else {
    const updates: {
      googleId?: string
      profileImage?: string
      name?: string
      authProvider?: string
    } = {}
    if (!user.googleId) updates.googleId = uid
    if (!user.profileImage && picture) updates.profileImage = picture
    if (!user.name && typeof name === 'string' && name) updates.name = name

    if (Object.keys(updates).length > 0 || user.authProvider !== 'google') {
      updates.authProvider = user.password ? 'local-google' : 'google'
      user = await prisma.user.update({ where: { id: user.id }, data: updates })
    }
  }

  res.status(200).json({
    message: 'Google login successful',
    token: signAppToken(user),
    user: publicUser(user),
  })
}

// POST /api/auth/login
// A wrong email and a wrong password get the same answer, so the login form
// can't be used to find out who has an account.
const loginUser = async (req: Request<object, unknown, LoginBody>, res: Response) => {
  const { email, password } = req.body
  const invalid = () => new UnauthorizedError('Incorrect email or password.', 'INVALID_CREDENTIALS')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw invalid()
  if (!user.password) {
    throw new BadRequestError(
      'This account uses Google sign-in. Continue with Google instead.',
      'USE_GOOGLE_SIGN_IN',
    )
  }
  if (!(await bcrypt.compare(password, user.password))) throw invalid()

  res.status(200).json({
    message: 'Login successful',
    token: signAppToken(user),
    user: publicUser(user),
  })
}

export { registerUser, googleLogin, loginUser }
