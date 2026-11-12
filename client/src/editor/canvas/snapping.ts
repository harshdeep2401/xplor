// Snapping for the 2D editor: pull a point onto the walls already drawn, so
// rooms close and openings sit on walls. All values are canvas pixels.
import type { EditorElement, WallElement } from './elements'

// How close (canvas px) a point must be to snap.
export const SNAP_DISTANCE_PX = 20

// The nearest wall start, end or midpoint within `threshold`, else the point
// itself. Used for wall ends and the measuring tools.
export function snapToWallPoints(
  x: number,
  y: number,
  elements: EditorElement[],
  threshold = SNAP_DISTANCE_PX,
): { x: number; y: number } {
  let minDistance = threshold
  let snappedX = x
  let snappedY = y
  for (const el of elements) {
    if (el.type !== 'wall') continue
    const candidates = [
      [el.startX, el.startY],
      [el.endX, el.endY],
      [(el.startX + el.endX) / 2, (el.startY + el.endY) / 2],
    ]
    for (const [px, py] of candidates) {
      const d = Math.hypot(px - x, py - y)
      if (d < minDistance) {
        minDistance = d
        snappedX = px
        snappedY = py
      }
    }
  }
  return { x: snappedX, y: snappedY }
}

export interface EdgeSnap {
  x: number
  y: number
  // The wall's direction in degrees, or null when nothing was close enough.
  angle: number | null
  wall: WallElement | null
}

// The nearest point on any wall (as a straight segment) within `threshold`,
// with that wall and its angle. Used to place doors and windows.
export function snapToWallEdge(
  x: number,
  y: number,
  elements: EditorElement[],
  threshold = SNAP_DISTANCE_PX,
): EdgeSnap {
  let minDistance = threshold
  let result: EdgeSnap = { x, y, angle: null, wall: null }
  for (const el of elements) {
    if (el.type !== 'wall') continue
    const l2 = (el.endX - el.startX) ** 2 + (el.endY - el.startY) ** 2
    if (l2 === 0) continue
    let t = ((x - el.startX) * (el.endX - el.startX) + (y - el.startY) * (el.endY - el.startY)) / l2
    t = Math.max(0, Math.min(1, t))
    const projX = el.startX + t * (el.endX - el.startX)
    const projY = el.startY + t * (el.endY - el.startY)
    const d = Math.hypot(projX - x, projY - y)
    if (d < minDistance) {
      minDistance = d
      result = {
        x: projX,
        y: projY,
        angle: Math.atan2(el.endY - el.startY, el.endX - el.startX) * (180 / Math.PI),
        wall: el,
      }
    }
  }
  return result
}

// How much a window of `width` px bows when it sits on a curved wall: the
// wall's bow scaled down by the square of the window's share of the wall.
export function windowCurvatureOn(wall: WallElement, width: number): number {
  if (!wall.curvature) return 0
  const wallLen = Math.hypot(wall.endX - wall.startX, wall.endY - wall.startY) || 1
  return wall.curvature * Math.pow(width / wallLen, 2)
}
