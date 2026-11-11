import { describe, expect, test, vi } from 'vitest'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { prisma } from '../../config/db'
import { api, errorOf, signUp } from './helpers'

// Google sign-in goes through Firebase; tests replace it with a fake verifier.
const verifyIdToken = vi.fn()
let firebaseConfigured = true
vi.mock('../../config/firebaseAdmin', () => ({
  firebaseAuth: () => {
    if (!firebaseConfigured) throw new Error('not configured')
    return { verifyIdToken }
  },
}))

describe('POST /api/auth/register', () => {
  test('creates the account, hashes the password and returns a working token', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: '  Ada  ', email: 'ada@example.test', password: 'Testing123', phone: '123' })
      .expect(201)

    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Ada',
      email: 'ada@example.test',
      profileImage: '',
    })
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'ada@example.test' } })
    expect(stored.password).not.toBe('Testing123')
    expect(await bcrypt.compare('Testing123', stored.password!)).toBe(true)
    expect(stored.authProvider).toBe('local')

    await api()
      .get('/api/projects')
      .set({ Authorization: `Bearer ${res.body.token}` })
      .expect(200)
  })

  test('refuses a second account with the same email', async () => {
    const user = await signUp()
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Copy', email: user.email, password: 'Testing123' })
      .expect(409)
    expect(errorOf(res).code).toBe('EMAIL_TAKEN')
  })

  test('validates the form, reporting the first problem as the message', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Ada', email: 'ada@example.test', password: 'lowercase1' })
      .expect(400)
    expect(errorOf(res)).toEqual({
      code: 'VALIDATION_FAILED',
      message:
        'Password must be at least 6 characters long and contain at least one capital letter.',
    })
    expect(res.body.details).toEqual([
      { path: 'body.password', message: expect.stringMatching(/capital letter/) },
    ])
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('POST /api/auth/login', () => {
  test('signs in with the right password', async () => {
    const user = await signUp('Bea')
    const res = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Testing123' })
      .expect(200)
    expect(res.body.user.name).toBe('Bea')
    expect(jwt.decode(res.body.token)).toMatchObject({ id: user.id, email: user.email })
  })

  test('a wrong password and an unknown email get the same answer', async () => {
    const user = await signUp()
    const wrong = await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Wrong1234' })
      .expect(401)
    const unknown = await api()
      .post('/api/auth/login')
      .send({ email: 'nobody@example.test', password: 'Wrong1234' })
      .expect(401)
    expect(errorOf(wrong)).toEqual(errorOf(unknown))
    expect(errorOf(wrong).code).toBe('INVALID_CREDENTIALS')
  })

  test('a Google-only account is pointed at Google sign-in', async () => {
    await prisma.user.create({
      data: { name: 'G', email: 'g@example.test', password: null, authProvider: 'google' },
    })
    const res = await api()
      .post('/api/auth/login')
      .send({ email: 'g@example.test', password: 'Whatever1' })
      .expect(400)
    expect(errorOf(res).code).toBe('USE_GOOGLE_SIGN_IN')
  })
})

describe('POST /api/auth/google-login', () => {
  test('creates a user on first sign-in', async () => {
    firebaseConfigured = true
    verifyIdToken.mockResolvedValueOnce({
      uid: 'g-1',
      email: 'new@example.test',
      name: 'New Person',
      picture: 'https://example.test/p.png',
    })
    const res = await api()
      .post('/api/auth/google-login')
      .send({ token: 'firebase-token' })
      .expect(200)
    expect(verifyIdToken).toHaveBeenCalledWith('firebase-token')
    expect(res.body.user).toMatchObject({ name: 'New Person', email: 'new@example.test' })
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'new@example.test' } })
    expect(stored).toMatchObject({ googleId: 'g-1', authProvider: 'google' })
  })

  test('links Google to an existing email account', async () => {
    firebaseConfigured = true
    const user = await signUp('Linked')
    verifyIdToken.mockResolvedValueOnce({ uid: 'g-2', email: user.email, picture: 'pic' })
    await api().post('/api/auth/google-login').send({ token: 't' }).expect(200)
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(stored).toMatchObject({
      googleId: 'g-2',
      profileImage: 'pic',
      authProvider: 'local-google',
    })
    // The email password keeps working.
    await api()
      .post('/api/auth/login')
      .send({ email: user.email, password: 'Testing123' })
      .expect(200)
  })

  test('a rejected Google token is a 401', async () => {
    firebaseConfigured = true
    verifyIdToken.mockRejectedValueOnce(new Error('expired'))
    const res = await api().post('/api/auth/google-login').send({ token: 'bad' }).expect(401)
    expect(errorOf(res).code).toBe('INVALID_GOOGLE_TOKEN')
  })

  test('without Firebase configured, Google sign-in is unavailable (503)', async () => {
    firebaseConfigured = false
    const res = await api().post('/api/auth/google-login').send({ token: 't' }).expect(503)
    expect(errorOf(res).code).toBe('GOOGLE_SIGN_IN_UNAVAILABLE')
  })
})

describe('protected routes', () => {
  test('need a token', async () => {
    const res = await api().get('/api/projects').expect(401)
    expect(errorOf(res).code).toBe('NO_TOKEN')
  })

  test('reject a forged, expired or orphaned token', async () => {
    const forged = jwt.sign({ id: 'x', email: 'x' }, 'not-the-server-secret')
    const res = await api()
      .get('/api/projects')
      .set({ Authorization: `Bearer ${forged}` })
      .expect(401)
    expect(errorOf(res).code).toBe('INVALID_TOKEN')

    const user = await signUp()
    const expired = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, {
      expiresIn: -10,
    })
    await api()
      .get('/api/projects')
      .set({ Authorization: `Bearer ${expired}` })
      .expect(401)

    const noId = jwt.sign({ email: user.email }, process.env.JWT_SECRET!)
    await api()
      .get('/api/projects')
      .set({ Authorization: `Bearer ${noId}` })
      .expect(401)

    await prisma.user.delete({ where: { id: user.id } })
    const gone = await api().get('/api/projects').set(user.auth).expect(401)
    expect(errorOf(gone).code).toBe('USER_NOT_FOUND')
  })
})
