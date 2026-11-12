import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import TransformModeBar from './TransformModeBar'
import ExportGlbModal from './ExportGlbModal'

describe('TransformModeBar', () => {
  test('shows the active mode with its key, and switches on click', async () => {
    const onChange = vi.fn()
    render(<TransformModeBar mode="rotate" onChange={onChange} />)
    const bar = screen.getByRole('toolbar', { name: 'Transform mode' })
    expect(screen.getByRole('button', { name: /Rotate/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Move/ })).toHaveAttribute('title', 'Move (W)')
    expect(bar).toHaveTextContent('Resize')
    await userEvent.click(screen.getByRole('button', { name: /Resize/ }))
    expect(onChange).toHaveBeenCalledWith('scale')
  })
})

describe('ExportGlbModal', () => {
  function renderModal() {
    const props = { onNameChange: vi.fn(), onCancel: vi.fn(), onExport: vi.fn() }
    render(<ExportGlbModal open name="flat" {...props} />)
    return props
  }

  test('asks for a file name and exports on the button or Enter', async () => {
    const p = renderModal()
    const field = screen.getByLabelText(/File name/)
    expect(field).toHaveValue('flat')
    expect(screen.getByText('.glb is added for you.')).toBeInTheDocument()
    await userEvent.type(field, 's')
    expect(p.onNameChange).toHaveBeenLastCalledWith('flats')
    await userEvent.type(field, '{Enter}')
    await userEvent.click(screen.getByRole('button', { name: 'Export' }))
    expect(p.onExport).toHaveBeenCalledTimes(2)
  })

  test('Cancel and Esc close it without exporting', async () => {
    const p = renderModal()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.keyboard('{Escape}')
    expect(p.onCancel).toHaveBeenCalledTimes(2)
    expect(p.onExport).not.toHaveBeenCalled()
  })

  test('renders nothing when closed', () => {
    render(
      <ExportGlbModal
        open={false}
        name=""
        onNameChange={vi.fn()}
        onCancel={vi.fn()}
        onExport={vi.fn()}
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
