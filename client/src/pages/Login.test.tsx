import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Login from './Login'
import { getToken, getUser } from '../services/session'
import { API, server } from '../test/server'

// Google sign-in opens a Firebase popup; tests decide what it returns.
const signInWithPopup = vi.fn()
vi.mock('firebase/auth', () => ({ signInWithPopup: (...a: unknown[]) => signInWithPopup(...a) }))
vi.mock('../firebase', () => ({ auth: {}, provider: {} }))

beforeEach(() => signInWithPopup.mockReset())

const session = { token: 'app-token', user: { id: 'u1', name: 'Ada', email: 'ada@example.test' } }

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fillAndSubmit(email = 'ada@example.test', password = 'Testing123') {
  await userEvent.type(screen.getByPlaceholderText('Email Address'), email)
  await userEvent.type(screen.getByPlaceholderText('Password'), password)
  await userEvent.click(screen.getByRole('button', { name: 'Log In' }))
}

describe('Login', () => {
  test('signs in, stores the session and opens the dashboard', async () => {
    let sent: unknown
    server.use(
      http.post(`${API}/auth/login`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(session)
      }),
    )
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(sent).toEqual({ email: 'ada@example.test', password: 'Testing123' })
    expect(getToken()).toBe('app-token')
    expect(getUser()).toMatchObject({ name: 'Ada' })
  })

  test('shows the server’s message and lets the user try again', async () => {
    server.use(
      http.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { message: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' },
          { status: 401 },
        ),
      ),
    )
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect email or password.')
    expect(screen.getByRole('button', { name: 'Log In' })).toBeEnabled()
    expect(getToken()).toBeNull()

    // Typing again clears the message.
    await userEvent.type(screen.getByPlaceholderText('Password'), 'x')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('says so when the server can’t be reached', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()))
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server')
  })

  test('the buttons are disabled while signing in', async () => {
    let finish!: () => void
    server.use(
      http.post(`${API}/auth/login`, async () => {
        await new Promise<void>((r) => (finish = r))
        return HttpResponse.json(session)
      }),
    )
    renderLogin()
    await fillAndSubmit()
    expect(await screen.findByRole('button', { name: 'Logging in…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
    finish()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
  })

  test('Google: the Firebase token is exchanged for an app session', async () => {
    signInWithPopup.mockResolvedValueOnce({ user: { getIdToken: async () => 'firebase-id' } })
    let sent: unknown
    server.use(
      http.post(`${API}/auth/google-login`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(session)
      }),
    )
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(sent).toEqual({ token: 'firebase-id' })
  })

  test('Google: a closed popup and a server refusal both explain themselves', async () => {
    signInWithPopup.mockRejectedValueOnce(new Error('auth/popup-closed-by-user'))
    renderLogin()
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google login failed. Please try again.',
    )

    signInWithPopup.mockResolvedValueOnce({ user: { getIdToken: async () => 'id' } })
    server.use(
      http.post(`${API}/auth/google-login`, () =>
        HttpResponse.json(
          {
            message: 'Google sign-in is not available right now.',
            code: 'GOOGLE_SIGN_IN_UNAVAILABLE',
          },
          { status: 503 },
        ),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }))
    expect(
      await screen.findByText('Google sign-in is not available right now.'),
    ).toBeInTheDocument()
  })
})
