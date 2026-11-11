import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import Toaster from './Toaster'
import { getToasts, toast } from './toast'

afterEach(() => {
  act(() => getToasts().forEach((t) => toast.dismiss(t.id)))
  vi.useRealTimers()
})

describe('Toaster', () => {
  test('errors are announced as alerts, the rest as status messages', () => {
    render(<Toaster />)
    act(() => {
      toast.success('Project saved')
      toast.error('Could not save.')
    })
    expect(screen.getByRole('status')).toHaveTextContent('Project saved')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save.')
  })

  test('a toast can be dismissed', async () => {
    render(<Toaster />)
    act(() => {
      toast.info('Heads up')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Heads up')).not.toBeInTheDocument()
  })

  test('the same id replaces a toast instead of stacking another', () => {
    render(<Toaster />)
    act(() => {
      toast.error('Autosave failed (1)', { id: 'autosave' })
      toast.error('Autosave failed (2)', { id: 'autosave' })
    })
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('alert')).toHaveTextContent('Autosave failed (2)')
  })

  test('toasts close by themselves (errors stay longest), unless duration is 0', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => {
      toast.success('Saved')
      toast.error('Broken')
      toast.info('Sticky', { duration: 0 })
    })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
    expect(screen.getByText('Broken')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.queryByText('Broken')).not.toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(screen.getByText('Sticky')).toBeInTheDocument()
  })

  test('at most four are shown; the oldest goes first', () => {
    render(<Toaster />)
    act(() => {
      for (let i = 1; i <= 5; i++) toast.info(`Message ${i}`, { duration: 0 })
    })
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(4)
  })
})
