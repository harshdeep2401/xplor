import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import App from './App'

vi.mock('firebase/auth', () => ({ signInWithPopup: vi.fn() }))
vi.mock('./firebase', () => ({ auth: {}, provider: {} }))

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('App routes', () => {
  test('the landing page is part of the app (no loader)', () => {
    renderAt('/')
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  test('other pages show a loader while their code downloads, then the page', async () => {
    renderAt('/login')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(await screen.findByRole('button', { name: 'Log In' })).toBeInTheDocument()
  })

  test('protected pages still send signed-out visitors to login', async () => {
    renderAt('/dashboard')
    expect(await screen.findByRole('button', { name: 'Log In' })).toBeInTheDocument()
  })
})
