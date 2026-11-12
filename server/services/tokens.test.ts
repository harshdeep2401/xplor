import jwt from 'jsonwebtoken'
import { expect, test } from 'vitest'
import { signAppToken, verifyAppToken } from './tokens'

const secret = process.env.JWT_SECRET!
const user = { id: 'u1', email: 'ada@example.test' }

test('a signed token verifies and expires in 7 days', () => {
  const token = signAppToken(user)
  expect(verifyAppToken(token)).toMatchObject(user)
  const { exp, iat } = jwt.decode(token) as { exp: number; iat: number }
  expect(exp - iat).toBe(7 * 24 * 3600)
  expect(JSON.parse(atob(token.split('.')[0]))).toMatchObject({ alg: 'HS256' })
})

test('forged, expired, other-algorithm and malformed tokens are refused', () => {
  expect(verifyAppToken(jwt.sign(user, 'another-secret'))).toBeNull()
  expect(verifyAppToken(jwt.sign(user, secret, { expiresIn: -1 }))).toBeNull()
  // Same secret, different algorithm: only HS256 is accepted.
  expect(verifyAppToken(jwt.sign(user, secret, { algorithm: 'HS512' }))).toBeNull()
  // An unsigned token ("alg": "none").
  const none = `${btoa('{"alg":"none","typ":"JWT"}')}.${btoa(JSON.stringify(user))}.`
  expect(verifyAppToken(none)).toBeNull()
  expect(verifyAppToken('not-a-token')).toBeNull()
  // Valid signature but no user id.
  expect(verifyAppToken(jwt.sign({ email: 'x' }, secret))).toBeNull()
})
