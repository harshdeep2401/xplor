import { useCallback, useState } from 'react'
import type { EditorElement } from '../../editor/canvas/elements'

// The drawing and its undo history.
//   commit(next)   a finished edit: becomes the drawing and one undo step
//   setElements    a change in progress (a wall following the mouse): shown,
//                  but not an undo step until it's committed
//   reset(loaded)  a freshly loaded drawing: the history starts there
export function useElementHistory() {
  const [elements, setElements] = useState<EditorElement[]>([])
  const [history, setHistory] = useState<EditorElement[][]>([])
  const [step, setStep] = useState(-1)

  const commit = useCallback(
    (next: EditorElement[]) => {
      setElements(next)
      const kept = history.slice(0, step + 1)
      kept.push(next)
      setHistory(kept)
      setStep(kept.length - 1)
    },
    [history, step],
  )

  const reset = useCallback((loaded: EditorElement[]) => {
    setElements(loaded)
    setHistory([loaded])
    setStep(0)
  }, [])

  // Each returns whether it did anything.
  const undo = useCallback(() => {
    if (step <= 0) return false
    setStep(step - 1)
    setElements(history[step - 1])
    return true
  }, [history, step])

  const redo = useCallback(() => {
    if (step >= history.length - 1) return false
    setStep(step + 1)
    setElements(history[step + 1])
    return true
  }, [history, step])

  // Change some fields of one element, as one undo step.
  const patchElement = useCallback(
    (id: string, patch: Partial<EditorElement>) => {
      commit(elements.map((el) => (el.id === id ? ({ ...el, ...patch } as EditorElement) : el)))
    },
    [commit, elements],
  )

  return {
    elements,
    setElements,
    commit,
    reset,
    undo,
    redo,
    patchElement,
    // False until a drawing has been loaded (nothing to save yet).
    loaded: step >= 0,
    canUndo: step > 0,
    canRedo: step < history.length - 1,
  }
}

export type ElementHistory = ReturnType<typeof useElementHistory>
