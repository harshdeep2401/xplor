// What each drawing tool creates, and how a wall or window follows the mouse
// while it's being drawn. Pure functions over canvas-pixel coordinates; the 2D
// editor (pages/editor2d/usePlanPointer.ts) calls them from mouse events.
import type {
  DoorElement,
  EditorElement,
  LabelElement,
  WallElement,
  WindowElement,
} from './elements'
import { snapToWallEdge, snapToWallPoints, windowCurvatureOn } from './snapping'

// Default sizes for new elements, in canvas pixels.
export const NEW_WALL_THICKNESS_PX = 30
export const NEW_DOOR_WIDTH_PX = 120
export const NEW_WINDOW_DEPTH_PX = 30
export const NEW_LABEL_FONT_SIZE = 24
export const MIN_WINDOW_WIDTH_PX = 10

// A wall is straightened when it's within ~11° of horizontal or vertical.
const STRAIGHTEN_RATIO = 0.2

// Ids are unique per editor session and sort by creation time.
const newId = (type: EditorElement['type']) => `${type}_${Date.now()}`

// A zero-length wall starting at (x, y) — snapped to existing walls — whose end
// then follows the mouse (wallEnd).
export function startWall(x: number, y: number, elements: EditorElement[]): WallElement {
  const snap = snapToWallPoints(x, y, elements)
  return {
    id: newId('wall'),
    type: 'wall',
    startX: snap.x,
    startY: snap.y,
    endX: snap.x,
    endY: snap.y,
    thickness: NEW_WALL_THICKNESS_PX,
  }
}

// Where the end of `wall` goes for the mouse at (x, y): straightened when
// nearly horizontal/vertical (always with Shift), then snapped to the other
// walls' ends and midpoints.
export function wallEnd(
  wall: WallElement,
  x: number,
  y: number,
  others: EditorElement[],
  straight: boolean,
): { x: number; y: number } {
  let endX = x
  let endY = y
  const dx = Math.abs(endX - wall.startX)
  const dy = Math.abs(endY - wall.startY)
  if (straight || dx < dy * STRAIGHTEN_RATIO || dy < dx * STRAIGHTEN_RATIO) {
    if (dx < dy) endX = wall.startX
    else endY = wall.startY
  }
  return snapToWallPoints(endX, endY, others)
}

// A door placed with one click, on the nearest wall if there's one close by.
export function placeDoor(x: number, y: number, elements: EditorElement[]): DoorElement {
  const snap = snapToWallEdge(x, y, elements)
  return {
    id: newId('door'),
    type: 'door',
    x: snap.x,
    y: snap.y,
    width: NEW_DOOR_WIDTH_PX,
    height: 4,
    rotation: snap.angle ?? 0,
  }
}

// A 1 px window at (x, y), on the nearest wall if close; dragging stretches it
// (stretchWindow).
export function startWindow(x: number, y: number, elements: EditorElement[]): WindowElement {
  const snap = snapToWallEdge(x, y, elements)
  return {
    id: newId('window'),
    type: 'window',
    x: snap.x,
    y: snap.y,
    startX: snap.x,
    startY: snap.y,
    width: 1,
    height: NEW_WINDOW_DEPTH_PX,
    rotation: snap.angle ?? 0,
    curvature: snap.wall ? windowCurvatureOn(snap.wall, 1) : 0,
    attachedWallId: snap.wall ? snap.wall.id : null,
  }
}

// The window being drawn, stretched from its start to the mouse at (x, y)
// (snapped onto a wall). On a curved wall it bows with it.
export function stretchWindow(
  win: WindowElement,
  x: number,
  y: number,
  others: EditorElement[],
): WindowElement {
  const snap = snapToWallEdge(x, y, others)
  const width = Math.max(MIN_WINDOW_WIDTH_PX, Math.hypot(snap.x - win.startX, snap.y - win.startY))
  const onCurvedWall = snap.wall?.curvature ? snap.wall : null
  return {
    ...win,
    x: (win.startX + snap.x) / 2,
    y: (win.startY + snap.y) / 2,
    width,
    rotation: snap.angle ?? win.rotation,
    curvature: onCurvedWall ? windowCurvatureOn(onCurvedWall, width) : 0,
    attachedWallId: onCurvedWall ? onCurvedWall.id : null,
  }
}

// A room name at (x, y), renamed in the properties panel.
export function placeLabel(x: number, y: number): LabelElement {
  return {
    id: newId('label'),
    type: 'label',
    x,
    y,
    text: 'Room Name',
    fontSize: NEW_LABEL_FONT_SIZE,
  }
}

export interface Box {
  startX: number
  startY: number
  endX: number
  endY: number
}

// Ids of the elements a selection box covers: a wall when either of its ends
// is inside, anything else when its position is inside.
export function elementsInBox(elements: EditorElement[], box: Box): string[] {
  const minX = Math.min(box.startX, box.endX)
  const maxX = Math.max(box.startX, box.endX)
  const minY = Math.min(box.startY, box.endY)
  const maxY = Math.max(box.startY, box.endY)
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY
  return elements
    .filter((el) =>
      el.type === 'wall'
        ? inside(el.startX, el.startY) || inside(el.endX, el.endY)
        : inside(el.x, el.y),
    )
    .map((el) => el.id)
}
