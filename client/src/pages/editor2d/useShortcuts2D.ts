import { useEffect } from 'react'
import { toast } from '../../components/toast/toast'
import type { Selection } from './useSelection'

// Arrow-key nudge distance in metres (Shift = coarse).
const NUDGE_M = 0.05
const NUDGE_COARSE_M = 0.5

interface ShortcutActions {
  selection: Selection
  allIds: string[]
  pixelsPerMetre: number
  undo: () => void
  redo: () => void
  zoomBy: (factor: number) => void
  // Esc: also leaves the current tool and clears the measuring line.
  escape: () => void
}

// The 2D editor's keyboard shortcuts (listed in the properties sidebar).
// Ignored while typing in a field.
export function useShortcuts2D({
  selection,
  allIds,
  pixelsPerMetre,
  undo,
  redo,
  zoomBy,
  escape,
}: ShortcutActions) {
  const {
    selectedIds,
    setSelection,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    rotateSelected,
    nudgeSelection,
  } = selection

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return // typing in a field
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      if (e.key === 'Escape') {
        escape()
        return
      }

      if (ctrl && key === 'z') {
        // Ctrl+Z undo, Ctrl+Shift+Z redo
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (ctrl && key === 'y') {
        e.preventDefault()
        redo()
      } else if (ctrl && key === 'c') {
        if (copySelection()) {
          e.preventDefault()
          toast.info(`Copied ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}.`, {
            id: 'clipboard',
            duration: 1500,
          })
        }
      } else if (ctrl && key === 'v') {
        e.preventDefault()
        pasteClipboard()
      } else if (ctrl && key === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (ctrl && key === 'a') {
        e.preventDefault()
        setSelection(allIds)
      } else if (!ctrl && key === 'r') {
        e.preventDefault()
        rotateSelected()
      } else if (e.key === '=' || e.key === '+') {
        zoomBy(1.1)
      } else if (e.key === '-' || e.key === '_') {
        zoomBy(1 / 1.1)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelection()
      } else if (e.key.startsWith('Arrow') && selectedIds.length > 0) {
        // Nudge the selection (Shift = bigger steps)
        e.preventDefault()
        const step = (e.shiftKey ? NUDGE_COARSE_M : NUDGE_M) * pixelsPerMetre
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        nudgeSelection(dx, dy)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    selectedIds,
    setSelection,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    rotateSelected,
    nudgeSelection,
    allIds,
    pixelsPerMetre,
    undo,
    redo,
    zoomBy,
    escape,
  ])
}
