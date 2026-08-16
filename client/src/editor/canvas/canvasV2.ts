import type {
  EditorElement,
  WallElement,
  DoorElement,
  WindowElement,
  LabelElement,
} from './elements'

// Transforms between the editor's internal element model (elements.ts) and the
// canvas-v2 CONTRACT (see /contracts/canvas-v2.schema.json). The editor draws in
// pixels with free placement; canvas-v2 is the canonical wire/storage format with
// parametric openings. This mirrors the server-side converter's element→v2 mapping
// (server/services/converter/normalizeCanvas.ts) so both agree on the geometry.

// --- canvas-v2 shape (client mirror of the schema) ---
export interface CanvasV2Point {
  x: number
  y: number
}
export interface CanvasV2Wall {
  id: string
  start: CanvasV2Point
  end: CanvasV2Point
  thickness: number
  curvature?: number
}
export interface CanvasV2Opening {
  id: string
  type: 'door' | 'window'
  wallId: string
  offset: number
  width: number
  height: number
  sillHeight?: number
}
export interface CanvasV2Label {
  id: string
  position: CanvasV2Point
  text: string
  fontSize?: number
}
export interface CanvasV2 {
  version: 'canvas-v2'
  scale: { pixelsPerMetre: number }
  wallHeight: number
  walls: CanvasV2Wall[]
  openings?: CanvasV2Opening[]
  labels?: CanvasV2Label[]
}

// Defaults for the VERTICAL dimensions of openings. A top-down 2D editor genuinely
// cannot capture these, so we assign sensible real-world values per type (metres).
export const DOOR_HEIGHT_M = 2.1
export const WINDOW_HEIGHT_M = 1.2
export const WINDOW_SILL_HEIGHT_M = 0.9

// Project defaults when a canvas has no recorded scale/height (e.g. a brand-new
// project). 40 px = 1 m, 1.0 m ceilings — matches the DB canonical defaults
// (Project.scalePixelsPerMeter / defaultWallHeightM) and the server converter.
export const DEFAULT_PIXELS_PER_METRE = 40
export const DEFAULT_WALL_HEIGHT_M = 1.0

// 2D glyph size (px) used when reconstructing an opening element from the
// parametric contract on load. Cosmetic only; the interactive door/window rework
// (later polish pass) will replace this.
const OPENING_GLYPH_PX = 40

// --- geometry (px space; mirrors server/services/converter/geometry.ts) ---
function projectParam(p: CanvasV2Point, s: CanvasV2Point, e: CanvasV2Point): number {
  const dx = e.x - s.x
  const dy = e.y - s.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  const t = ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2
  return Math.min(1, Math.max(0, t))
}
function distanceToSegment(p: CanvasV2Point, s: CanvasV2Point, e: CanvasV2Point): number {
  const t = projectParam(p, s, e)
  const cx = s.x + t * (e.x - s.x)
  const cy = s.y + t * (e.y - s.y)
  return Math.hypot(p.x - cx, p.y - cy)
}
function pointAt(w: CanvasV2Wall, offset: number): CanvasV2Point {
  return { x: w.start.x + offset * (w.end.x - w.start.x), y: w.start.y + offset * (w.end.y - w.start.y) }
}
function wallAngle(w: CanvasV2Wall): number {
  return Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * (180 / Math.PI)
}

// ---------------------------------------------------------------------------
// SAVE: editor elements -> canvas-v2. Openings attach to the nearest wall (or
// their recorded attachedWallId); unlike the server bridge we do NOT drop distant
// openings — attaching to the nearest wall keeps the drawing lossless on reload.
// An opening can only be dropped if there are no walls at all to attach it to.
// ---------------------------------------------------------------------------
export function toCanvasV2(
  elements: EditorElement[],
  pixelsPerMetre: number,
  wallHeight: number,
): CanvasV2 {
  const walls: CanvasV2Wall[] = []
  const openings: CanvasV2Opening[] = []
  const labels: CanvasV2Label[] = []

  const wallElements = elements.filter((el): el is WallElement => el.type === 'wall')

  for (const el of elements) {
    if (el.type === 'wall') {
      const wall: CanvasV2Wall = {
        id: el.id,
        start: { x: el.startX, y: el.startY },
        end: { x: el.endX, y: el.endY },
        thickness: el.thickness,
      }
      if (el.curvature) wall.curvature = el.curvature
      walls.push(wall)
    } else if (el.type === 'label') {
      labels.push({ id: el.id, position: { x: el.x, y: el.y }, text: el.text, fontSize: el.fontSize })
    }
  }

  const attachTo = (point: CanvasV2Point, preferredWallId?: string | null): CanvasV2Wall | undefined => {
    if (preferredWallId) {
      const found = walls.find((w) => w.id === preferredWallId)
      if (found) return found
    }
    let best: CanvasV2Wall | undefined
    let bestDist = Infinity
    for (const w of walls) {
      const d = distanceToSegment(point, w.start, w.end)
      if (d < bestDist) {
        bestDist = d
        best = w
      }
    }
    return best
  }

  for (const el of elements) {
    if (el.type === 'window') {
      const wall = attachTo({ x: el.x, y: el.y }, el.attachedWallId)
      if (!wall) continue
      openings.push({
        id: el.id,
        type: 'window',
        wallId: wall.id,
        offset: projectParam({ x: el.x, y: el.y }, wall.start, wall.end),
        width: el.width,
        height: WINDOW_HEIGHT_M,
        sillHeight: WINDOW_SILL_HEIGHT_M,
      })
    } else if (el.type === 'door') {
      const wall = attachTo({ x: el.x, y: el.y })
      if (!wall) continue
      openings.push({
        id: el.id,
        type: 'door',
        wallId: wall.id,
        offset: projectParam({ x: el.x, y: el.y }, wall.start, wall.end),
        width: el.width,
        height: DOOR_HEIGHT_M,
        sillHeight: 0,
      })
    }
  }
  void wallElements // walls already collected above; kept for symmetry/readability

  return {
    version: 'canvas-v2',
    scale: { pixelsPerMetre },
    wallHeight,
    walls,
    openings,
    labels,
  }
}

// ---------------------------------------------------------------------------
// LOAD: canvas-v2 -> editor elements (+ scale/wallHeight). Openings are placed at
// their parametric offset along the wall, oriented to the wall. 2D glyph sizes are
// reconstructed with a constant (cosmetic; see OPENING_GLYPH_PX).
// ---------------------------------------------------------------------------
export interface LoadedCanvas {
  elements: EditorElement[]
  pixelsPerMetre: number
  wallHeight: number
}

export function fromCanvasV2(canvas: CanvasV2): LoadedCanvas {
  const wallsById = new Map(canvas.walls.map((w) => [w.id, w]))
  const elements: EditorElement[] = []

  for (const w of canvas.walls) {
    const wall: WallElement = {
      id: w.id,
      type: 'wall',
      startX: w.start.x,
      startY: w.start.y,
      endX: w.end.x,
      endY: w.end.y,
      thickness: w.thickness,
    }
    if (w.curvature) wall.curvature = w.curvature
    elements.push(wall)
  }

  for (const op of canvas.openings ?? []) {
    const wall = wallsById.get(op.wallId)
    if (!wall) continue
    const p = pointAt(wall, op.offset)
    const rotation = wallAngle(wall)
    if (op.type === 'door') {
      const door: DoorElement = {
        id: op.id,
        type: 'door',
        x: p.x,
        y: p.y,
        width: op.width,
        height: OPENING_GLYPH_PX,
        rotation,
      }
      elements.push(door)
    } else {
      const win: WindowElement = {
        id: op.id,
        type: 'window',
        x: p.x,
        y: p.y,
        startX: p.x,
        startY: p.y,
        width: op.width,
        height: OPENING_GLYPH_PX,
        rotation,
        curvature: 0,
        attachedWallId: op.wallId,
      }
      elements.push(win)
    }
  }

  for (const l of canvas.labels ?? []) {
    const label: LabelElement = {
      id: l.id,
      type: 'label',
      x: l.position.x,
      y: l.position.y,
      text: l.text,
      fontSize: l.fontSize ?? 16,
    }
    elements.push(label)
  }

  return {
    elements,
    pixelsPerMetre: canvas.scale.pixelsPerMetre,
    wallHeight: canvas.wallHeight,
  }
}

// Type guard: does a stored project.canvas already use the canvas-v2 contract?
export function isCanvasV2(raw: unknown): raw is CanvasV2 {
  return typeof raw === 'object' && raw !== null && (raw as { version?: unknown }).version === 'canvas-v2'
}
