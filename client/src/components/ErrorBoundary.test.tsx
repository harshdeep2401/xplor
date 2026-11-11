import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('WebGL context lost')
  return <p>Editor ready</p>
}

beforeEach(() => {
  // React and the boundary both report the crash to the console; keep the
  // test output clean (and check the boundary's own report).
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

describe('ErrorBoundary', () => {
  test('renders its children while nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <Bomb explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Editor ready')).toBeInTheDocument()
  })

  test('a render crash shows a way out instead of a blank page', () => {
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByText(/Your last saved work is safe/)).toBeInTheDocument()
    // Development builds show the cause.
    expect(screen.getByText('WebGL context lost')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    )
    expect(console.error).toHaveBeenCalledWith(
      'Render error:',
      expect.any(Error),
      expect.any(String),
    )
  })

  test('Reload page reloads', async () => {
    const reload = vi.fn()
    vi.spyOn(window, 'location', 'get').mockReturnValue({ ...window.location, reload })
    render(
      <ErrorBoundary>
        <Bomb explode />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Reload page' }))
    expect(reload).toHaveBeenCalledOnce()
  })

  test('a new resetKey (navigating away) clears the error', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/editor/3d/1">
        <Bomb explode />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    // Same page: still broken.
    rerender(
      <ErrorBoundary resetKey="/editor/3d/1">
        <Bomb explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()

    rerender(
      <ErrorBoundary resetKey="/dashboard">
        <Bomb explode={false} />
      </ErrorBoundary>,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Editor ready')).toBeInTheDocument()
  })
})
