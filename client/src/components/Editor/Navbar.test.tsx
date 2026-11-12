import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import Navbar from './Navbar'

function renderNavbar(props: Partial<Parameters<typeof Navbar>[0]> = {}) {
  const handlers = {
    onSave: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onVrPreview: vi.fn(),
    onBack: vi.fn(),
  }
  render(<Navbar projectName="Flat 2B" {...handlers} {...props} />)
  return handlers
}

describe('editor Navbar', () => {
  test('shows the project and runs each action', async () => {
    const h = renderNavbar({ subtitle: '8.6 × 4 m' })
    expect(screen.getByText('Flat 2B')).toBeInTheDocument()
    expect(screen.getByText('8.6 × 4 m')).toBeInTheDocument()
    for (const [name, fn] of [
      ['Back to dashboard', h.onBack],
      ['Undo', h.onUndo],
      ['Redo', h.onRedo],
      ['Save', h.onSave],
      ['VR Preview', h.onVrPreview],
    ] as const) {
      await userEvent.click(screen.getByRole('button', { name }))
      expect(fn).toHaveBeenCalledOnce()
    }
  })

  test('save status: spinner while saving, then a label', () => {
    const { rerender } = render(
      <Navbar
        projectName="P"
        onSave={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onVrPreview={vi.fn()}
        saveStatus="saving"
      />,
    )
    expect(screen.getByText('Saving…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Back to dashboard' })).not.toBeInTheDocument()

    rerender(
      <Navbar
        projectName="P"
        onSave={vi.fn()}
        onUndo={vi.fn()}
        onRedo={vi.fn()}
        onVrPreview={vi.fn()}
        saveStatus="error"
      />,
    )
    expect(screen.getByText('Save failed')).toHaveClass('text-danger')
  })
})
