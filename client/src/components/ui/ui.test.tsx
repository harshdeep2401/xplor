import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, test, vi } from 'vitest'
import Button from './Button'
import Field from './Field'
import Modal from './Modal'
import NumberInput from './NumberInput'

describe('Button', () => {
  test('clicks, and is disabled with a spinner while loading', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Save</Button>)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClick).toHaveBeenCalledOnce()

    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save' }).querySelector('svg')).toBeInTheDocument()
  })
})

describe('Field', () => {
  test('labels its input and shows a hint', () => {
    render(<Field label="Project name" hint="You can rename it later." defaultValue="Flat" />)
    expect(screen.getByLabelText(/Project name/)).toHaveValue('Flat')
    expect(screen.getByText('You can rename it later.')).toBeInTheDocument()
  })
})

describe('Modal', () => {
  function renderModal(busy = false) {
    const onClose = vi.fn()
    render(
      <Modal
        open
        title="New project"
        onClose={onClose}
        busy={busy}
        footer={<button>Create</button>}
      >
        <input aria-label="Name" />
      </Modal>,
    )
    return onClose
  }

  test('is a labelled dialog that focuses its first field', () => {
    renderModal()
    expect(screen.getByRole('dialog', { name: 'New project' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Create' })).toBeInTheDocument()
  })

  test('closes on Esc, the close button, or a click outside', async () => {
    const onClose = renderModal()
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(onClose).toHaveBeenCalledTimes(3)
    // A click inside doesn't close it.
    fireEvent.mouseDown(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  test('stays open while busy', async () => {
    const onClose = renderModal(true)
    await userEvent.keyboard('{Escape}')
    fireEvent.mouseDown(screen.getByRole('dialog').parentElement!)
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(onClose).not.toHaveBeenCalled()
  })

  test('renders nothing when closed', () => {
    render(
      <Modal open={false} title="Hidden" onClose={vi.fn()}>
        x
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('NumberInput', () => {
  function Harness({ onChange }: { onChange: (n: number) => void }) {
    const [value, setValue] = useState(2.5)
    return (
      <NumberInput
        aria-label="Height"
        value={value}
        min={0}
        onChange={(n) => {
          setValue(n)
          onChange(n)
        }}
      />
    )
  }

  test('lets decimals be typed, updating live with valid numbers only', async () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    const input = screen.getByRole('spinbutton', { name: 'Height' })
    expect(input).toHaveValue(2.5)

    await userEvent.clear(input)
    await userEvent.type(input, '3.05')
    expect(input).toHaveValue(3.05)
    expect(onChange).toHaveBeenLastCalledWith(3.05)

    // Below the minimum: shown while typing, but not passed on.
    onChange.mockClear()
    await userEvent.clear(input)
    await userEvent.type(input, '-1')
    expect(onChange).not.toHaveBeenCalledWith(-1)

    // Leaving the box shows the last valid value again.
    await userEvent.tab()
    expect(input).not.toHaveValue(-1)
  })
})
