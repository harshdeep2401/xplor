import type Konva from 'konva'
import type { EdgeSnap } from '../../../editor/canvas/snapping'

// What every drawn element needs from the editor.
export interface ElementInteraction {
  // A click (additive = Shift held: add to / remove from the selection).
  onElementClick: (id: string, additive?: boolean) => void
  // Doors/windows/labels can be dragged on their own with the Select tool.
  draggable: (id: string) => boolean
  isSelected: (id: string) => boolean
  // Snap a point onto the nearest wall (doors and windows ride along walls).
  snapToWall: (x: number, y: number) => EdgeSnap
  // The canvas size, to keep dragged items on it.
  bounds: { width: number; height: number }
}

// Click, tap and double-click on an element select it; a double-click on an
// element must not reach the stage (which would reset the tool).
export function clickHandlers(id: string, onElementClick: ElementInteraction['onElementClick']) {
  const select = () => onElementClick(id)
  const stopAndSelect = (e: Konva.KonvaEventObject<Event>) => {
    e.cancelBubble = true
    select()
  }
  return {
    onClick: (e: Konva.KonvaEventObject<MouseEvent>) => onElementClick(id, e.evt.shiftKey),
    onTap: select,
    onDblClick: stopAndSelect,
    onDblTap: stopAndSelect,
  }
}

// While dragging a door or window: keep it on the canvas and on the nearest
// wall, turned to match the wall.
export function followWall(e: Konva.KonvaEventObject<DragEvent>, ctx: ElementInteraction) {
  const x = Math.max(0, Math.min(ctx.bounds.width, e.target.x()))
  const y = Math.max(0, Math.min(ctx.bounds.height, e.target.y()))
  const snap = ctx.snapToWall(x, y)
  if (snap.angle !== null) e.target.rotation(snap.angle)
  e.target.x(snap.x)
  e.target.y(snap.y)
}

// Selected elements are drawn in this colour.
export const SELECTED_COLOUR = '#14b8a6'
