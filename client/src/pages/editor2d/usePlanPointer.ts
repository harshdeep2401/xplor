import { useRef, useState } from 'react'
import Konva from 'konva'
import type { EditorElement, WallElement, WindowElement } from '../../editor/canvas/elements'
import { translateElements } from '../../editor/canvas/editing'
import { snapToWallPoints } from '../../editor/canvas/snapping'
import {
  elementsInBox,
  placeDoor,
  placeLabel,
  startWall,
  startWindow,
  stretchWindow,
  wallEnd,
  type Box,
} from '../../editor/canvas/drawing'
import type { ElementHistory } from './useElementHistory'
import type { MeasureTools } from './useMeasureTools'
import type { Selection } from './useSelection'
import type { Tool } from './types'

interface PointerDeps {
  plan: { canvasWidth: number; canvasHeight: number } | null
  activeTool: Tool
  history: Pick<ElementHistory, 'elements' | 'setElements' | 'commit'>
  selection: Selection
  measure: MeasureTools
}

// A mouse move started on a wall or a multi-selection. Single doors, windows
// and labels use Konva's own drag instead (it snaps them to walls).
interface MoveInProgress {
  startX: number
  startY: number
  ids: Set<string>
  // The drawing when the move started; the moved ids are offset from it.
  base: EditorElement[]
  moved: boolean
}

// Everything the mouse does on the plan, per tool: select (click, box, move),
// draw walls and windows by dragging, place doors and labels by clicking,
// measure and calibrate. Returns the stage's mouse handlers plus what the
// stage draws while a gesture is in progress.
export function usePlanPointer({ plan, activeTool, history, selection, measure }: PointerDeps) {
  const { elements, setElements, commit } = history
  const [isDrawing, setIsDrawing] = useState(false)
  const [selectionBox, setSelectionBox] = useState<Box | null>(null)
  // The pointer, in canvas pixels (shown as metres under the plan).
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const moveRef = useRef<MoveInProgress | null>(null)
  // Set when a mouse move just finished, so the click that follows it doesn't
  // change the selection.
  const justMovedRef = useRef(false)

  // The pointer in canvas pixels, clamped to the canvas.
  const planPoint = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    const pos = stage?.getPointerPosition()
    if (!stage || !pos) return null
    const scale = stage.scaleX()
    return {
      x: Math.max(0, Math.min(plan?.canvasWidth || 1000, (pos.x - stage.x()) / scale)),
      y: Math.max(0, Math.min(plan?.canvasHeight || 1000, (pos.y - stage.y()) / scale)),
      scale,
    }
  }

  // Which element (if any) a Konva node belongs to: each element's top-level
  // group/shape carries the element id as its Konva id.
  const elementIdAt = (node: Konva.Node | null): string | null => {
    const ids = new Set(elements.map((el) => el.id))
    while (node && node.getType() !== 'Stage') {
      const id = node.id()
      if (id && ids.has(id)) return id
      node = node.getParent()
    }
    return null
  }

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const p = planPoint(e)
    if (!p) return
    justMovedRef.current = false

    if (activeTool === 'select') {
      const hitId = elementIdAt(e.target)
      if (!hitId) {
        // Empty canvas: start a selection box (Shift keeps the current selection).
        if (!e.evt.shiftKey) selection.clearSelection()
        setSelectionBox({ startX: p.x, startY: p.y, endX: p.x, endY: p.y })
        return
      }
      // Pressing on part of a multi-selection moves all of it; pressing on a
      // wall moves that wall. (Single doors/windows/labels drag themselves.)
      const { selectedIds } = selection
      const inGroup = selectedIds.length > 1 && selectedIds.includes(hitId)
      const hit = elements.find((el) => el.id === hitId)
      if (!e.evt.shiftKey && (inGroup || hit?.type === 'wall')) {
        moveRef.current = {
          startX: p.x,
          startY: p.y,
          ids: new Set(inGroup ? selectedIds : [hitId]),
          base: elements,
          moved: false,
        }
      }
      return
    }

    if (activeTool === 'measure' || activeTool === 'calibrate') {
      setIsDrawing(true)
      const snap = snapToWallPoints(p.x, p.y, elements)
      const line = { startX: snap.x, startY: snap.y, endX: snap.x, endY: snap.y }
      if (activeTool === 'measure') measure.setMeasureLine(line)
      else measure.setCalibration(line)
      return
    }

    if (activeTool === 'wall') {
      setIsDrawing(true)
      setElements([...elements, startWall(p.x, p.y, elements)])
    } else if (activeTool === 'door') {
      commit([...elements, placeDoor(p.x, p.y, elements)])
    } else if (activeTool === 'window') {
      setIsDrawing(true)
      setElements([...elements, startWindow(p.x, p.y, elements)])
    } else if (activeTool === 'label') {
      commit([...elements, placeLabel(p.x, p.y)])
    }
  }

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!plan) return
    const p = planPoint(e)
    if (!p) return
    setCursorPos({ x: Math.round(p.x), y: Math.round(p.y) })

    if (selectionBox) {
      setSelectionBox({ ...selectionBox, endX: p.x, endY: p.y })
      return
    }

    const move = moveRef.current
    if (move && (e.evt.buttons & 1) === 0) {
      // The button was released outside the canvas: finish the move here.
      moveRef.current = null
      if (move.moved) commit(elements)
      return
    }
    if (move) {
      const dx = p.x - move.startX
      const dy = p.y - move.startY
      // Ignore tiny jitters of a plain click (same threshold as Konva's drags).
      if (!move.moved && Math.hypot(dx, dy) * p.scale < Konva.dragDistance) return
      move.moved = true
      setElements(translateElements(move.base, move.ids, dx, dy))
      return
    }

    if (isDrawing && activeTool === 'measure') {
      measure.setMeasureLine((prev) => {
        if (!prev) return prev
        let { x: endX, y: endY } = snapToWallPoints(p.x, p.y, elements)
        // Shift: straight horizontal or vertical.
        if (e.evt.shiftKey) {
          if (Math.abs(endX - prev.startX) < Math.abs(endY - prev.startY)) endX = prev.startX
          else endY = prev.startY
        }
        return { ...prev, endX, endY }
      })
      return
    }

    if (isDrawing && activeTool === 'calibrate') {
      const snap = snapToWallPoints(p.x, p.y, elements)
      measure.setCalibration((prev) => (prev ? { ...prev, endX: snap.x, endY: snap.y } : prev))
      return
    }

    if (!isDrawing) return
    // The wall or window being drawn is the last element; it follows the mouse.
    if (activeTool === 'window') {
      setElements((prev) => [
        ...prev.slice(0, -1),
        stretchWindow(prev[prev.length - 1] as WindowElement, p.x, p.y, prev.slice(0, -1)),
      ])
    } else if (activeTool === 'wall') {
      setElements((prev) => {
        const wall = prev[prev.length - 1] as WallElement
        const end = wallEnd(wall, p.x, p.y, prev.slice(0, -1), e.evt.shiftKey)
        return [...prev.slice(0, -1), { ...wall, endX: end.x, endY: end.y }]
      })
    }
  }

  const onMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const move = moveRef.current
    if (move) {
      moveRef.current = null
      if (move.moved) {
        commit(elements) // one undo step for the whole move
        justMovedRef.current = true
      }
      return
    }

    if (selectionBox) {
      const boxed = elementsInBox(elements, selectionBox)
      // Shift adds the boxed elements to what was already selected.
      selection.setSelection(
        e.evt.shiftKey ? [...new Set([...selection.selectedIds, ...boxed])] : boxed,
      )
      setSelectionBox(null)
      return
    }

    if (isDrawing && (activeTool === 'wall' || activeTool === 'window')) {
      commit(elements) // the finished wall/window is one undo step
    }
    setIsDrawing(false)
  }

  // A click on an element. additive (Shift+click): add/remove it to/from the
  // selection. With the Delete tool, the click deletes it.
  const onElementClick = (id: string, additive = false) => {
    if (justMovedRef.current) {
      // The click that ends a drag-move: keep the selection as it is.
      justMovedRef.current = false
      return
    }
    if (activeTool === 'delete') {
      commit(elements.filter((el) => el.id !== id))
    } else if (additive) {
      const { selectedIds } = selection
      selection.setSelection(
        selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
      )
    } else {
      selection.setSelection([id])
    }
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onElementClick,
    isDrawing,
    selectionBox,
    cursorPos,
  }
}
