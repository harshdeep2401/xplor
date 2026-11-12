import { act, renderHook } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import type { EditorElement } from '../../editor/canvas/elements'
import { useElementHistory } from './useElementHistory'
import { useSelection } from './useSelection'
import { useMeasureTools } from './useMeasureTools'

const wall = (id: string, x = 0): EditorElement => ({
  id,
  type: 'wall',
  startX: x,
  startY: 0,
  endX: x + 100,
  endY: 0,
  thickness: 30,
})
const door: EditorElement = { id: 'd', type: 'door', x: 0, y: 0, width: 90, height: 4, rotation: 0 }

describe('useElementHistory', () => {
  test('commits are undo steps; in-progress changes are not', () => {
    const { result } = renderHook(() => useElementHistory())
    expect(result.current.loaded).toBe(false)
    act(() => result.current.reset([wall('a')]))
    expect(result.current).toMatchObject({ loaded: true, canUndo: false, canRedo: false })

    act(() => result.current.setElements([wall('a', 5)])) // dragging
    act(() => result.current.commit([wall('a', 10)]))
    expect(result.current.canUndo).toBe(true)

    let undone = false
    act(() => {
      undone = result.current.undo()
    })
    expect(undone).toBe(true)
    expect(result.current.elements).toEqual([wall('a')])
    act(() => {
      result.current.redo()
    })
    expect(result.current.elements).toEqual([wall('a', 10)])
    expect(result.current.canRedo).toBe(false)
  })

  test('a new edit after undo drops the redo branch; patchElement is one step', () => {
    const { result } = renderHook(() => useElementHistory())
    act(() => result.current.reset([wall('a')]))
    act(() => result.current.commit([wall('a'), wall('b')]))
    act(() => {
      result.current.undo()
    })
    act(() => result.current.patchElement('a', { thickness: 50 }))
    expect(result.current.canRedo).toBe(false)
    expect(result.current.elements).toEqual([{ ...wall('a'), thickness: 50 }])
    act(() => {
      result.current.undo()
    })
    expect(result.current.elements).toEqual([wall('a')])
  })
})

describe('useSelection', () => {
  function setup() {
    return renderHook(
      () => {
        const history = useElementHistory()
        const selection = useSelection(history)
        return { history, selection }
      },
      { initialProps: undefined },
    ).result
  }

  test('one selected vs several; delete, copy/paste with offset, rotate, nudge', () => {
    const result = setup()
    act(() => result.current.history.reset([wall('a'), wall('b', 200), door]))

    act(() => result.current.selection.setSelection(['a']))
    expect(result.current.selection.selectedElement?.id).toBe('a')
    act(() => result.current.selection.setSelection(['a', 'b']))
    expect(result.current.selection.selectedElementId).toBeNull()
    expect(result.current.selection.inMultiSelection('a')).toBe(true)

    // Copy + paste: copies 20 px away, and they become the selection.
    act(() => {
      result.current.selection.copySelection()
    })
    act(() => result.current.selection.pasteClipboard())
    const els = result.current.history.elements
    expect(els).toHaveLength(5)
    expect(els[3]).toMatchObject({ type: 'wall', startX: 20, startY: 20 })
    expect(result.current.selection.selectedIds).toEqual([els[3].id, els[4].id])

    act(() => result.current.selection.nudgeSelection(5, 0))
    expect(result.current.history.elements[3]).toMatchObject({ startX: 25 })

    act(() => result.current.selection.deleteSelection())
    expect(result.current.history.elements.map((e) => e.id)).toEqual(['a', 'b', 'd'])

    act(() => result.current.selection.setSelection(['d']))
    act(() => result.current.selection.rotateSelected())
    expect(result.current.history.elements.find((e) => e.id === 'd')).toMatchObject({
      rotation: 90,
    })
    // Walls don't rotate.
    act(() => result.current.selection.setSelection(['a']))
    act(() => result.current.selection.rotateSelected())
    expect(result.current.history.elements[0]).toEqual(wall('a'))
  })
})

describe('useMeasureTools', () => {
  test('calibration proposes px per metre and applies it rounded to 0.01', () => {
    let applied = 0
    const { result } = renderHook(() => useMeasureTools((v) => (applied = v)))
    act(() => result.current.setCalibration({ startX: 0, startY: 0, endX: 300, endY: 400 }))
    expect(result.current.calibrationPx).toBe(500)
    expect(result.current.canApplyCalibration).toBe(false)
    act(() => result.current.setCalibrationMetres('3'))
    expect(result.current.proposedScale).toBeCloseTo(166.667)
    let ok = false
    act(() => {
      ok = result.current.applyCalibration()
    })
    expect(ok).toBe(true)
    expect(applied).toBe(166.67)
    expect(result.current.calibration).toBeNull()
    expect(result.current.calibrationMetres).toBe('')
  })
})
