import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import SuggestionsPanel from './SuggestionsPanel'
import type { FurnitureSuggestion, RoomSuggestions } from '../../services/suggestions'
import { catalogItem } from '../../test/server'

const suggestion = (name: string, reason: string, role = name.toLowerCase()) =>
  ({
    item: catalogItem({ id: `kenney-${role}`, name }),
    score: 1,
    role,
    reason,
    placement: { position: { x: 1, y: 0, z: 2 }, rotationY: 0 },
    alternatives: [],
  }) as FurnitureSuggestion

const rooms: RoomSuggestions[] = [
  {
    roomId: 'living',
    name: 'Living room',
    type: 'living',
    area: 20.04,
    suggestions: [
      suggestion('Sofa', 'A living room usually has a sofa.'),
      suggestion('Coffee table', 'Goes with the sofa.', 'coffeeTable'),
    ],
  },
  { roomId: 'bed', type: 'bedroom', area: 12, suggestions: [] },
]

function renderPanel(props: Partial<Parameters<typeof SuggestionsPanel>[0]> = {}) {
  const handlers = { onRoomChange: vi.fn(), onAdd: vi.fn(), onRefresh: vi.fn() }
  render(
    <SuggestionsPanel
      rooms={rooms}
      loading={false}
      error={null}
      roomId={null}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('SuggestionsPanel', () => {
  test('lists the first room’s suggestions with their reasons', () => {
    renderPanel()
    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Room' })).toHaveDisplayValue('Living room · 20 m²')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]).getByText('Sofa')).toBeInTheDocument()
    expect(within(items[0]).getByText('A living room usually has a sofa.')).toBeInTheDocument()
  })

  test('Add hands the whole suggestion (with its spot) to the editor', async () => {
    const { onAdd } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Add Coffee table' }))
    expect(onAdd).toHaveBeenCalledWith(rooms[0].suggestions[1])
  })

  test('picking another room asks for it; an unnamed room is labelled by type', async () => {
    const { onRoomChange } = renderPanel()
    const select = screen.getByRole('combobox', { name: 'Room' })
    expect(within(select).getByRole('option', { name: 'Bedroom (room 2) · 12 m²' })).toBeTruthy()
    await userEvent.selectOptions(select, 'bed')
    expect(onRoomChange).toHaveBeenCalledWith('bed')
  })

  test('a room with nothing to add says so', () => {
    renderPanel({ roomId: 'bed' })
    expect(screen.getByText(/this room has what it needs/)).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('refresh, and buttons are disabled while loading', async () => {
    const { onRefresh } = renderPanel()
    await userEvent.click(screen.getByRole('button', { name: 'Refresh suggestions' }))
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  test('while loading, nothing can be added twice', () => {
    renderPanel({ loading: true })
    expect(screen.getByRole('button', { name: 'Refresh suggestions' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add Sofa' })).toBeDisabled()
  })

  test('first load, no rooms, and errors each have their own message', () => {
    const { rerender } = render(
      <SuggestionsPanel
        rooms={null}
        loading
        error={null}
        roomId={null}
        onRoomChange={vi.fn()}
        onAdd={vi.fn()}
        onRefresh={vi.fn()}
      />,
    )
    expect(screen.getByText('Looking at your rooms…')).toBeInTheDocument()

    const props = {
      loading: false,
      roomId: null,
      onRoomChange: vi.fn(),
      onAdd: vi.fn(),
      onRefresh: vi.fn(),
    }
    rerender(<SuggestionsPanel {...props} rooms={[]} error={null} />)
    expect(screen.getByText(/Suggestions need rooms/)).toBeInTheDocument()

    rerender(<SuggestionsPanel {...props} rooms={rooms} error="Could not load suggestions." />)
    expect(screen.getByText('Could not load suggestions.')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
