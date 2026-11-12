import type {
  DetectionV1,
  CanvasV1Element,
  CanvasV1Wall,
  CanvasV1Door,
  CanvasV1Window,
  CanvasV2,
} from './types'
import { normalizeCanvas, type CanvasDefaults } from './normalizeCanvas'
import { weldWalls } from './weldWalls'

// The Path B bridge: a detector's output (detection-v1, source-image pixels) ->
// the same canvas-v2 the 2D editor produces, so both input paths converge before
// the converter. Detection walls/openings have the same flat shape as legacy
// canvas-v1 elements, so we map to those and reuse normalizeCanvas for the
// parametric opening attachment (nearest wall within OPENING_SNAP_THRESHOLD_PX).
//
// Detected walls are first welded at corners/T-junctions (weldWalls) so rooms
// close in 3D. Image pixels are used 1:1 as canvas pixels (the caller sizes the canvas to the
// image), so the uploaded plan lines up exactly under the walls as a trace layer.
// Detected rooms are dropped: the converter derives rooms from the walls itself.
//
// Deterministic: same detection + defaults -> identical canvas.

// Fallbacks matching the defaults in Ai-service/app/schemas.py.
export const DETECTED_WALL_THICKNESS_PX = 8
export const DETECTED_DOOR_WIDTH_PX = 36
export const DETECTED_WINDOW_WIDTH_PX = 48

// Segments shorter than this are detector noise and would be degenerate walls.
const MIN_WALL_LENGTH_PX = 1

export function detectionToCanvas(detection: DetectionV1, defaults: CanvasDefaults = {}): CanvasV2 {
  const walls: CanvasV1Wall[] = (detection.walls ?? [])
    .filter((w) => Math.hypot(w.endX - w.startX, w.endY - w.startY) >= MIN_WALL_LENGTH_PX)
    .map((w) => ({
      id: w.id,
      type: 'wall',
      startX: w.startX,
      startY: w.startY,
      endX: w.endX,
      endY: w.endY,
      thickness: w.thickness ?? DETECTED_WALL_THICKNESS_PX,
    }))

  const doors: CanvasV1Door[] = (detection.doors ?? []).map((d) => {
    const width = d.width ?? DETECTED_DOOR_WIDTH_PX
    // height/rotation are 2D glyph cosmetics in canvas-v1; canvas-v2 ignores them.
    return { id: d.id, type: 'door', x: d.x, y: d.y, width, height: width, rotation: 0 }
  })

  const windows: CanvasV1Window[] = (detection.windows ?? []).map((w) => ({
    id: w.id,
    type: 'window',
    x: w.x,
    y: w.y,
    startX: w.x,
    startY: w.y,
    width: w.width ?? DETECTED_WINDOW_WIDTH_PX,
    height: 0,
    rotation: 0,
    curvature: 0,
    attachedWallId: null,
  }))

  const elements: CanvasV1Element[] = [...weldWalls(walls), ...doors, ...windows]
  return normalizeCanvas({ elements }, defaults)
}
