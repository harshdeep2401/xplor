import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, test } from 'vitest'
import Home from './Home'

function renderHome() {
  render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/signup" element={<p>Signup page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Home (landing page)', () => {
  test('shows every section', () => {
    renderHome()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Powerful Features/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '10K+' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'XPLOR' })).toBeInTheDocument()
    for (const link of screen.getAllByRole('link', { name: 'Features' })) {
      expect(link).toHaveAttribute('href', '#features')
    }
  })

  test('the navbar leads to sign-in and sign-up', async () => {
    renderHome()
    await userEvent.click(screen.getAllByRole('link', { name: /log ?in/i })[0])
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })
})
