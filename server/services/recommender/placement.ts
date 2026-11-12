import type { Vec2, Vec3 } from '../converter/types'
import type { PlaceMode } from './rules'
import type { Placement } from './types'
import {
  type Box,
  type Edge,
  add,
  angleFacing,
  centroid,
  collides,
  dot,
  insideRoom,
  local,
  roomEdges,
  scale,
} from './geometry'

// Deterministic placement of one item in one room: try candidate spots in a
// fixed order and take the first that's inside the room (clear of the walls)
// and doesn't hit anything. Same scene in → same spot out.

// Below this height an item is "flat" (rugs, mats): flat things may lie under
// furniture and in doorways, and only collide with each other.
const FLAT_M = 0.05
// Free space kept between items.
const CLEARANCE_M = 0.05
// Step when sliding along a wall or searching the floor.
const STEP_M = 0.1

export interface RoomSpace {
  polygon: Vec2[]
  // Keep this far from wall centre lines (half the wall thickness + a hair).
  wallMargin: number
  ceiling: number
  // Everything already in the way: placed items, doorway clearances.
  obstacles: Box[]
  // Inward normals of the edges with a door, with the door's centre (for mats).
  doors: { at: Vec2; inward: Vec2 }[]
}

export const isFlat = (b: Box) => b.y1 - b.y0 < FLAT_M

function blocked(box: Box, obstacles: Box[]): boolean {
  const flat = isFlat(box)
  return obstacles.some((o) => isFlat(o) === flat && collides(box, o, CLEARANCE_M))
}

function fits(box: Box, space: RoomSpace): boolean {
  return insideRoom(box, space.polygon, space.wallMargin) && !blocked(box, space.obstacles)
}

// 0, +s, -s, +2s, -2s … within ±limit.
function slideOffsets(limit: number): number[] {
  const out = [0]
  for (let k = 1; k * STEP_M <= limit + 1e-9; k++) out.push(k * STEP_M, -k * STEP_M)
  return out
}

function boxAt(centre: Vec2, angle: number, size: Vec3, y0: number): Box {
  return { centre, angle, hw: size.x / 2, hd: size.z / 2, y0, y1: y0 + size.y }
}

function toPlacement(box: Box): Placement {
  const r = (n: number) => Math.round(n * 1e4) / 1e4
  return {
    position: { x: r(box.centre.x), y: r(box.y0), z: r(box.centre.z) },
    rotationY: r(box.angle),
  }
}

// Back against a wall, facing into the room. Longest walls first (or, with
// `toward`, the wall that faces that point best), sliding out from the middle
// (or from opposite `toward`).
function againstWall(size: Vec3, space: RoomSpace, y0: number, toward?: Vec2): Box | null {
  let edges: Edge[] = roomEdges(space.polygon)
  if (toward) {
    const mid = (e: Edge) => scale(add(e.start, e.end), 0.5)
    const facing = (e: Edge) => {
      const m = mid(e)
      const d = { x: toward.x - m.x, z: toward.z - m.z }
      const len = Math.hypot(d.x, d.z) || 1
      return dot(e.inward, { x: d.x / len, z: d.z / len })
    }
    edges = [...edges].sort((a, b) => facing(b) - facing(a))
  }
  for (const e of edges) {
    const room = e.length - 2 * space.wallMargin
    if (room < size.x) continue
    const half = e.length / 2
    // Slide origin: the edge middle, or the spot opposite `toward`.
    let origin = 0
    if (toward)
      origin = Math.max(
        -half,
        Math.min(half, dot({ x: toward.x - e.start.x, z: toward.z - e.start.z }, e.dir) - half),
      )
    const limit = half - size.x / 2
    for (const off of slideOffsets(2 * limit)) {
      const s = origin + off
      if (Math.abs(s) > limit + 1e-9) continue
      const centre = add(
        add(e.start, scale(e.dir, half + s)),
        scale(e.inward, space.wallMargin + size.z / 2 + 0.01),
      )
      const box = boxAt(centre, angleFacing(e.inward), size, y0)
      if (fits(box, space)) return box
    }
  }
  return null
}

// Free floor nearest the room's centre, lined up with its longest wall.
function nearCentre(size: Vec3, space: RoomSpace, y0: number): Box | null {
  const c = centroid(space.polygon)
  const edges = roomEdges(space.polygon)
  if (!edges.length) return null
  const angle = angleFacing(edges[0].inward)
  let reach = 0
  for (const p of space.polygon) reach = Math.max(reach, Math.hypot(p.x - c.x, p.z - c.z))
  // Capped so a huge room stays cheap (80 steps = 8 m each way from the centre).
  const n = Math.min(80, Math.ceil(reach / STEP_M))
  const spots: Vec2[] = []
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++) spots.push({ x: c.x + i * STEP_M, z: c.z + j * STEP_M })
  // Nearest first; ties broken by x then z so the order is fixed.
  spots.sort((a, b) => {
    const da = Math.hypot(a.x - c.x, a.z - c.z)
    const db = Math.hypot(b.x - c.x, b.z - c.z)
    return da - db || a.x - b.x || a.z - b.z
  })
  for (const s of spots) {
    const box = boxAt(s, angle, size, y0)
    if (fits(box, space)) return box
  }
  return null
}

// Candidate spots relative to an anchor, by mode.
function anchoredCandidates(mode: PlaceMode, a: Box, size: Vec3): Box[] {
  const hw = size.x / 2
  const hd = size.z / 2
  switch (mode.kind) {
    case 'front': {
      const centre = local(a, 0, a.hd + mode.gap + hd)
      return [boxAt(centre, mode.faceAnchor ? a.angle + Math.PI : a.angle, size, a.y0)]
    }
    case 'beside':
      // Level with the anchor's back (a bed's head), either side.
      return [1, -1].map((side) =>
        boxAt(local(a, side * (a.hw + hw + CLEARANCE_M + 0.01), -a.hd + hd), a.angle, size, a.y0),
      )
    case 'around': {
      // Facing the anchor from its long sides (alternating), then its ends.
      const out: Box[] = []
      const perSide = Math.max(1, Math.floor((2 * a.hw) / 0.6))
      const out_ = CLEARANCE_M + 0.01
      for (let k = 0; k < perSide; k++) {
        const x = perSide === 1 ? 0 : -a.hw + ((k + 0.5) * 2 * a.hw) / perSide
        out.push(boxAt(local(a, x, a.hd + hd + out_), a.angle + Math.PI, size, a.y0))
        out.push(boxAt(local(a, x, -a.hd - hd - out_), a.angle, size, a.y0))
      }
      out.push(boxAt(local(a, a.hw + hd + out_, 0), a.angle - Math.PI / 2, size, a.y0))
      out.push(boxAt(local(a, -a.hw - hd - out_, 0), a.angle + Math.PI / 2, size, a.y0))
      return out
    }
    case 'on': {
      if (hw > a.hw + 1e-9 || hd > a.hd + 1e-9) return []
      const back = -(a.hd - hd)
      const sideways = a.hw - hw
      return [
        [0, back],
        [-sideways, back],
        [sideways, back],
        [0, 0],
      ].map(([x, z]) => boxAt(local(a, x, z), a.angle, size, a.y1))
    }
    case 'above':
      return [boxAt(local(a, 0, -a.hd + hd), a.angle, size, mode.y0(a.y1))]
    default:
      return []
  }
}

// Where to put an item of `size` (metres) in this room, or null if there's no room.
// `anchors` are the boxes of the role's anchor in this room (existing or suggested);
// `faceTargets` are positions a 'wall' mode with faceRole should face.
export function place(
  mode: PlaceMode,
  size: Vec3,
  space: RoomSpace,
  anchors: Box[],
  faceTargets: Vec2[] = [],
): Placement | null {
  let box: Box | null = null
  switch (mode.kind) {
    case 'wall':
      box = againstWall(size, space, mode.y0 ?? 0, faceTargets[0])
      break
    case 'centre':
      box = nearCentre(size, space, 0)
      break
    case 'ceiling':
      box = nearCentre(size, space, Math.max(0, space.ceiling - size.y))
      break
    case 'door':
      for (const d of space.doors) {
        const candidate = boxAt(
          add(d.at, scale(d.inward, space.wallMargin + size.z / 2 + 0.02)),
          angleFacing(d.inward),
          size,
          0,
        )
        if (fits(candidate, space)) {
          box = candidate
          break
        }
      }
      box ??= nearCentre(size, space, 0)
      break
    default:
      for (const a of anchors) {
        box = anchoredCandidates(mode, a, size).find((b) => fits(b, space)) ?? null
        if (box) break
      }
      // No anchor (or no room by it): stand-alone fallbacks for modes that have one.
      if (!box && mode.kind === 'beside') box = againstWall(size, space, 0)
      if (!box && mode.kind === 'above' && anchors.length === 0)
        box = againstWall(size, space, mode.y0(0.9))
  }
  if (!box) return null
  space.obstacles.push(box)
  return toPlacement(box)
}

// The box an item occupies once placed (used to add suggestions as obstacles/anchors).
export function boxOfPlacement(p: Placement, size: Vec3): Box {
  return boxAt({ x: p.position.x, z: p.position.z }, p.rotationY, size, p.position.y)
}
