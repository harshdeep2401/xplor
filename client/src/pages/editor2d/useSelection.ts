import { useCallback, useMemo, useRef, useState } from 'react'
import { duplicateElements, translateElements } from '../../editor/canvas/editing'
import type { ElementHistory } from './useElementHistory'

// How far a pasted copy is offset from the original, in canvas pixels.
const PASTE_OFFSET_PX = 20

// What's selected, and the edits that act on the selection (delete, copy,
// paste, duplicate, rotate, nudge).
//
// The selection is one clicked element (`selectedElementId`) or several from a
// box or Shift+click (`marqueeSelectionIds`); `selectedIds` is either as a list.
export function useSelection({ elements, commit }: Pick<ElementHistory, 'elements' | 'commit'>) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [marqueeSelectionIds, setMarqueeSelectionIds] = useState<string[]>([])
  // Copy/paste: the copied elements, and how many times they've been pasted
  // (each paste lands a little further away).
  const clipboardRef = useRef<{ elements: typeof elements; pastes: number } | null>(null)

  const selectedIds = useMemo(
    () => (selectedElementId ? [selectedElementId] : marqueeSelectionIds),
    [selectedElementId, marqueeSelectionIds],
  )

  const setSelection = useCallback((ids: string[]) => {
    if (ids.length === 1) {
      setSelectedElementId(ids[0])
      setMarqueeSelectionIds([])
    } else {
      setSelectedElementId(null)
      setMarqueeSelectionIds(ids)
    }
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedElementId(null)
    setMarqueeSelectionIds([])
  }, [])

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    commit(elements.filter((el) => !ids.has(el.id)))
    setSelection([])
  }, [elements, selectedIds, commit, setSelection])

  // Returns false when there's nothing to copy.
  const copySelection = useCallback(() => {
    if (selectedIds.length === 0) return false
    const ids = new Set(selectedIds)
    clipboardRef.current = { elements: elements.filter((el) => ids.has(el.id)), pastes: 0 }
    return true
  }, [elements, selectedIds])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.elements.length === 0) return
    clip.pastes += 1
    const copies = duplicateElements(clip.elements, PASTE_OFFSET_PX * clip.pastes)
    commit([...elements, ...copies])
    setSelection(copies.map((c) => c.id))
  }, [elements, commit, setSelection])

  const duplicateSelection = useCallback(() => {
    if (copySelection()) pasteClipboard()
  }, [copySelection, pasteClipboard])

  // Turn the selected door or window a quarter turn.
  const rotateSelected = useCallback(() => {
    if (!selectedElementId) return
    commit(
      elements.map((el) =>
        el.id === selectedElementId && (el.type === 'door' || el.type === 'window')
          ? { ...el, rotation: (el.rotation || 0) + 90 }
          : el,
      ),
    )
  }, [elements, selectedElementId, commit])

  // Move the selection by (dx, dy) canvas pixels, as one undo step.
  const nudgeSelection = useCallback(
    (dx: number, dy: number) => {
      commit(translateElements(elements, new Set(selectedIds), dx, dy))
    },
    [elements, selectedIds, commit],
  )

  const isSelected = useCallback(
    (id: string) => selectedElementId === id || marqueeSelectionIds.includes(id),
    [selectedElementId, marqueeSelectionIds],
  )

  // Part of a multi-selection (moved as a group, not dragged alone).
  const inMultiSelection = useCallback(
    (id: string) => marqueeSelectionIds.length > 1 && marqueeSelectionIds.includes(id),
    [marqueeSelectionIds],
  )

  return {
    selectedElementId,
    setSelectedElementId,
    selectedIds,
    selectedElement: elements.find((el) => el.id === selectedElementId),
    setSelection,
    clearSelection,
    deleteSelection,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    rotateSelected,
    nudgeSelection,
    isSelected,
    inMultiSelection,
  }
}

export type Selection = ReturnType<typeof useSelection>
