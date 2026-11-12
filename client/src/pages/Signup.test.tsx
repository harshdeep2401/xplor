import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import Signup from './Signup'
import { getToken } from '../services/session'
import { API, server } from '../test/server'

const signInWithPopup = vi.fn()
vi.mock('firebase/auth', () => ({ signInWithPopup: (...a: unknown[]) => signInWithPopup(...a) }))
vi.mock('../firebase', () => ({ auth: {}, provider: {} }))

function renderSignup() {
  render(
    <MemoryRouter initialEntries={['/signup']}>
      <Routes>
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function fill({
  password = 'Testing123',
  confirm,
}: { password?: string; confirm?: string } = {}) {
  await userEvent.type(screen.getByPlaceholderText('Full Name'), 'Ada Lovelace')
  await userEvent.type(screen.getByPlaceholderText('Email Address'), 'ada@example.test')
  await userEvent.selectOptions(screen.getByRole('combobox'), '+44')
  await userEvent.type(screen.getByPlaceholderText('Phone Number'), '7700900000')
  await userEvent.type(screen.getByPlaceholderText('Password'), password)
  await userEvent.type(screen.getByPlaceholderText('Confirm Password'), confirm ?? password)
  await userEvent.click(screen.getByRole('button', { name: /sign up|create account/i }))
}

describe('Signup', () => {
  test('creates the account and opens the dashboard', async () => {
    let sent: unknown
    server.use(
      http.post(`${API}/auth/register`, async ({ request }) => {
        sent = await request.json()
        return HttpResponse.json(
          { token: 'tok', user: { id: 'u1', name: 'Ada Lovelace' } },
          { status: 201 },
        )
      }),
    )
    renderSignup()
    await fill()
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(sent).toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.test',
      countryCode: '+44',
      phone: '7700900000',
      password: 'Testing123',
    })
    expect(getToken()).toBe('tok')
  })

  test('checks the password rule and the confirmation before sending anything', async () => {
    renderSignup()
    await fill({ password: 'weakpass' })
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one capital letter/)
  })

  test('mismatched passwords are caught', async () => {
    renderSignup()
    await fill({ password: 'Testing123', confirm: 'Testing124' })
    expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match.')
  })

  test('an existing email shows the server’s message', async () => {
    server.use(
      http.post(`${API}/auth/register`, () =>
        HttpResponse.json(
          { message: 'An account with this email already exists.', code: 'EMAIL_TAKEN' },
          { status: 409 },
        ),
      ),
    )
    renderSignup()
    await fill()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account with this email already exists.',
    )
    expect(getToken()).toBeNull()
  })

  test('Google sign-up exchanges the Firebase token; failures explain themselves', async () => {
    signInWithPopup.mockResolvedValueOnce({ user: { getIdToken: async () => 'firebase-id' } })
    server.use(
      http.post(`${API}/auth/google-login`, () =>
        HttpResponse.json({ token: 'g-tok', user: { id: 'u1' } }),
      ),
    )
    renderSignup()
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(await screen.findByText('Dashboard')).toBeInTheDocument()
    expect(getToken()).toBe('g-tok')
  })

  test('a closed Google popup shows the generic message', async () => {
    signInWithPopup.mockRejectedValueOnce(new Error('auth/popup-closed-by-user'))
    renderSignup()
    await userEvent.click(screen.getByRole('button', { name: /google/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Google login failed. Please try again.',
    )
  })
})
