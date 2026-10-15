import type { CanvasV1Wall, Point } from './types'
import { distanceToSegment, projectParam } from './geometry'

// Geometry cleanup for DETECTED walls (Path B), applied by the bridge before
// normalizeCanvas. Detectors trace wall edges/boxes, so their segments stop a few
// pixels short of (or past) each other: corners don't meet and T-junctions float.
// detectRooms only closes a room over walls that share exact endpoints, so without
// this an imported plan converts to 3D with walls but no floors.
//
//   1. Weld — move each endpoint lying within WELD_TOLERANCE_PX of another
//      (non-parallel) wall's line onto the intersection of the two lines. Closes
//      L-corners (both walls move to the same point) and T-junctions.
//   2. Split — cut a wall wherever another wall's endpoint now lies strictly
//      inside it, so the junction becomes a shared vertex.
//
// Pure + deterministic: intersections are computed from the original segments,
// symmetrically per pair, and rounded, so walls that meet get identical points.

export const WELD_TOLERANCE_PX = 20

// Walls closer than this to parallel never weld to each other (their line
// intersection is far away or numerically unstable).
const MIN_WELD_ANGLE_SIN = Math.sin((15 * Math.PI) / 180)
const ON_SEGMENT_PX = 0.5

export function weldWalls(walls: CanvasV1Wall[]): CanvasV1Wall[] {
  const welded = walls.map((wall, i) => {
    const start = weldEndpoint(walls, i, { x: wall.startX, y: wall.startY })
    const end = weldEndpoint(walls, i, { x: wall.endX, y: wall.endY })
    return { ...wall, startX: start.x, startY: start.y, endX: end.x, endY: end.y }
  })
  return welded.flatMap((wall) => splitAtJunctions(wall, welded))
}

// Nearest qualifying intersection to `p` (an endpoint of walls[i]), or `p` itself.
function weldEndpoint(walls: CanvasV1Wall[], i: number, p: Point): Point {
  let best = p
  let bestDist = WELD_TOLERANCE_PX
  for (let j = 0; j < walls.length; j++) {
    if (j === i) continue
    const x = pairIntersection(walls, i, j)
    if (!x) continue
    const d = Math.hypot(x.x - p.x, x.y - p.y)
    if (d >= bestDist) continue
    // The other wall must actually reach (nearly) to the junction.
    if (distanceToSegment(x, start(walls[j]), end(walls[j])) > WELD_TOLERANCE_PX) continue
    best = x
    bestDist = d
  }
  return best
}

// Intersection of the infinite lines through walls i and j, computed in a fixed
// (lower index first) order so both walls of a corner get the identical point.
function pairIntersection(walls: CanvasV1Wall[], i: number, j: number): Point | null {
  const a = walls[Math.min(i, j)]
  const b = walls[Math.max(i, j)]
  const r = { x: a.endX - a.startX, y: a.endY - a.startY }
  const s = { x: b.endX - b.startX, y: b.endY - b.startY }
  const cross = r.x * s.y - r.y * s.x
  const lenProduct = Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)
  if (lenProduct === 0 || Math.abs(cross) / lenProduct < MIN_WELD_ANGLE_SIN) return null
  const t = ((b.startX - a.startX) * s.y - (b.startY - a.startY) * s.x) / cross
  return { x: round(a.startX + t * r.x), y: round(a.startY + t * r.y) }
}

// Split `wall` at every other wall endpoint lying strictly inside it.
function splitAtJunctions(wall: CanvasV1Wall, walls: CanvasV1Wall[]): CanvasV1Wall[] {
  const s = start(wall)
  const e = end(wall)
  const cuts = new Map<string, { t: number; p: Point }>()
  for (const other of walls) {
    if (other === wall) continue
    for (const p of [start(other), end(other)]) {
      if (distanceToSegment(p, s, e) > ON_SEGMENT_PX) continue
      const t = projectParam(p, s, e)
      if (t <= 0 || t >= 1) continue
      if (samePoint(p, s) || samePoint(p, e)) continue
      cuts.set(`${p.x}:${p.y}`, { t, p })
    }
  }
  if (cuts.size === 0) return [wall]

  const points = [s, ...[...cuts.values()].sort((a, b) => a.t - b.t).map((c) => c.p), e]
  return points.slice(1).map((p, k) => ({
    ...wall,
    id: `${wall.id}_${k + 1}`,
    startX: points[k].x,
    startY: points[k].y,
    endX: p.x,
    endY: p.y,
  }))
}

const start = (w: CanvasV1Wall): Point => ({ x: w.startX, y: w.startY })
const end = (w: CanvasV1Wall): Point => ({ x: w.endX, y: w.endY })
const samePoint = (a: Point, b: Point): boolean => a.x === b.x && a.y === b.y
const round = (v: number): number => Math.round(v * 100) / 100
