import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import { ProtectedRoute, RedirectIfAuthenticated } from './guards'
import { getToken, setSession } from '../../services/session'
import { fakeToken } from '../../test/server'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <p>Dashboard</p>
            </ProtectedRoute>
          }
        />
        <Route
          path="/login"
          element={
            <RedirectIfAuthenticated>
              <p>Login page</p>
            </RedirectIfAuthenticated>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('route guards', () => {
  test('signed out: protected pages send you to login', () => {
    renderAt('/dashboard')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  test('signed in: protected pages show, and login forwards to the dashboard', () => {
    setSession(fakeToken(), { id: 'u1', name: 'Ada' })
    renderAt('/dashboard')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  test('signed in users skip the login page', () => {
    setSession(fakeToken(), { id: 'u1' })
    renderAt('/login')
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  test('an expired session is cleared and treated as signed out', () => {
    setSession(fakeToken(-60), { id: 'u1' })
    renderAt('/dashboard')
    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
