import type {
  CanvasV1,
  CanvasV1Element,
  CanvasV1Wall,
  CanvasV1Door,
  CanvasV1Window,
  CanvasV1Label,
  CanvasV2,
  CanvasV2Wall,
  CanvasV2Opening,
  CanvasV2Label,
  Point,
} from './types'
import { projectParam, distanceToSegment } from './geometry'
import {
  DEFAULT_PIXELS_PER_METRE,
  DEFAULT_WALL_HEIGHT_M,
  DOOR_HEIGHT_M,
  WINDOW_HEIGHT_M,
  WINDOW_SILL_HEIGHT_M,
  OPENING_SNAP_THRESHOLD_PX,
} from './defaults'

// Per-project fallbacks used only when migrating a LEGACY canvas that carries no
// scale/height of its own (a canvas-v2 payload always supplies its own). Pass the
// project's real Project.scalePixelsPerMeter / defaultWallHeightM here.
export interface CanvasDefaults {
  pixelsPerMetre?: number
  wallHeight?: number
}

// Bring any accepted canvas payload up to canvas-v2. If it already declares
// version "canvas-v2" it's passed through untouched (forward-compatible for when
// the editor emits v2 directly). Otherwise it's treated as legacy canvas-v1 and
// migrated, using `defaults` (project columns) or the built-in constants.
//
// Deterministic: same input -> identical output. No time, no randomness. Element
// order is preserved, so openings come out in the order they were drawn.
export function normalizeCanvas(raw: unknown, defaults: CanvasDefaults = {}): CanvasV2 {
  if (isCanvasV2(raw)) return raw
  return fromLegacy(asCanvasV1(raw), defaults)
}

function isCanvasV2(raw: unknown): raw is CanvasV2 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { version?: unknown }).version === 'canvas-v2'
  )
}

function asCanvasV1(raw: unknown): CanvasV1 {
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as CanvasV1).elements)) {
    return raw as CanvasV1
  }
  return { elements: [] }
}

function fromLegacy(canvas: CanvasV1, defaults: CanvasDefaults): CanvasV2 {
  const elements: CanvasV1Element[] = canvas.elements ?? []

  const legacyWalls = elements.filter((el): el is CanvasV1Wall => el.type === 'wall')
  const legacyDoors = elements.filter((el): el is CanvasV1Door => el.type === 'door')
  const legacyWindows = elements.filter((el): el is CanvasV1Window => el.type === 'window')
  const legacyLabels = elements.filter((el): el is CanvasV1Label => el.type === 'label')

  const walls: CanvasV2Wall[] = legacyWalls.map((w) => ({
    id: w.id,
    start: { x: w.startX, y: w.startY },
    end: { x: w.endX, y: w.endY },
    thickness: w.thickness,
    ...(w.curvature ? { curvature: w.curvature } : {}),
  }))

  const openings: CanvasV2Opening[] = []

  // Windows: use their recorded attachedWallId when it points at a real wall,
  // otherwise fall back to nearest-wall snapping like doors.
  for (const win of legacyWindows) {
    const point: Point = { x: win.x, y: win.y }
    const attached = win.attachedWallId
      ? walls.find((w) => w.id === win.attachedWallId)
      : undefined
    const wall = attached ?? nearestWall(point, walls)
    if (!wall) continue
    openings.push({
      id: win.id,
      type: 'window',
      wallId: wall.id,
      offset: projectParam(point, wall.start, wall.end),
      width: win.width,
      height: WINDOW_HEIGHT_M,
      sillHeight: WINDOW_SILL_HEIGHT_M,
    })
  }

  // Doors: no wall attachment in v1 — snap each to the nearest wall.
  for (const door of legacyDoors) {
    const point: Point = { x: door.x, y: door.y }
    const wall = nearestWall(point, walls)
    if (!wall) continue
    openings.push({
      id: door.id,
      type: 'door',
      wallId: wall.id,
      offset: projectParam(point, wall.start, wall.end),
      width: door.width,
      height: DOOR_HEIGHT_M,
      sillHeight: 0,
    })
  }

  const labels: CanvasV2Label[] = legacyLabels.map((l) => ({
    id: l.id,
    position: { x: l.x, y: l.y },
    text: l.text,
    fontSize: l.fontSize,
  }))

  return {
    version: 'canvas-v2',
    scale: { pixelsPerMetre: defaults.pixelsPerMetre ?? DEFAULT_PIXELS_PER_METRE },
    wallHeight: defaults.wallHeight ?? DEFAULT_WALL_HEIGHT_M,
    walls,
    openings,
    labels,
  }
}

// Nearest wall to P within the snap threshold, or undefined. Deterministic:
// walls are scanned in order and ties keep the earlier wall (strict `<`).
function nearestWall(p: Point, walls: CanvasV2Wall[]): CanvasV2Wall | undefined {
  let best: CanvasV2Wall | undefined
  let bestDist = OPENING_SNAP_THRESHOLD_PX
  for (const wall of walls) {
    const d = distanceToSegment(p, wall.start, wall.end)
    if (d < bestDist) {
      bestDist = d
      best = wall
    }
  }
  return best
}
