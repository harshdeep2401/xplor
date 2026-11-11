import { z } from 'zod'

// Messages here are shown to the user as-is (the error handler sends the first
// problem as `message`), so they are written as sentences.

const email = z
  .string({ error: 'Please enter your email address.' })
  .trim()
  .max(254, 'That email address is too long.')
  .pipe(z.email('Please enter a valid email address.'))

// Same rule as the sign-up form: 6+ characters with a capital letter. bcrypt
// only reads the first 72 bytes, so longer passwords are refused, not cut.
const newPassword = z
  .string({ error: 'Please enter a password.' })
  .min(6, 'Password must be at least 6 characters long and contain at least one capital letter.')
  .max(72, 'Password must be at most 72 characters long.')
  .regex(
    /[A-Z]/,
    'Password must be at least 6 characters long and contain at least one capital letter.',
  )

export const registerBody = z.object({
  name: z
    .string({ error: 'Please enter your name.' })
    .trim()
    .min(1, 'Please enter your name.')
    .max(100, 'Name must be at most 100 characters.'),
  email,
  countryCode: z.string().trim().max(8).optional(),
  phone: z.string().trim().max(32).optional(),
  password: newPassword,
})
export type RegisterBody = z.infer<typeof registerBody>

export const loginBody = z.object({
  email,
  password: z
    .string({ error: 'Please enter your password.' })
    .min(1, 'Please enter your password.'),
})
export type LoginBody = z.infer<typeof loginBody>

export const googleLoginBody = z.object({
  token: z
    .string({ error: 'Missing Google sign-in token.' })
    .min(1, 'Missing Google sign-in token.'),
})
export type GoogleLoginBody = z.infer<typeof googleLoginBody>
