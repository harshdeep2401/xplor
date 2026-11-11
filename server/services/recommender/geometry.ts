import type { Vec2 } from '../converter/types'
import { pointInPolygon } from '../converter/roomSemantics'

// Floor-plane geometry for furniture placement (metres, scene-v1 coordinates).
//
// A placed item is an oriented box: a footprint rectangle on the floor turned by
// `angle` (= the asset's rotation.y) plus a height range. Rotation follows
// Three.js: rotation.y = θ turns the model's local +z (its front, for Kenney
// models) to (sin θ, cos θ) and its local +x to (cos θ, -sin θ).

export interface Box {
  centre: Vec2
  // Half width (local x) and half depth (local z).
  hw: number
  hd: number
  angle: number
  y0: number
  y1: number
}

export const frontOf = (angle: number): Vec2 => ({ x: Math.sin(angle), z: Math.cos(angle) })
export const rightOf = (angle: number): Vec2 => ({ x: Math.cos(angle), z: -Math.sin(angle) })
// The angle that makes a model's front face direction d.
export const angleFacing = (d: Vec2): number => Math.atan2(d.x, d.z)

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z })
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, z: a.z * k })
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.z * b.z
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z })

// Point at local (x across, z forward) offsets from a box's centre.
export function local(box: Pick<Box, 'centre' | 'angle'>, x: number, z: number): Vec2 {
  return add(box.centre, add(scale(rightOf(box.angle), x), scale(frontOf(box.angle), z)))
}

export function corners(box: Box): Vec2[] {
  return [
    local(box, -box.hw, -box.hd),
    local(box, box.hw, -box.hd),
    local(box, box.hw, box.hd),
    local(box, -box.hw, box.hd),
  ]
}

// Separating-axis test for two footprints. They count as overlapping unless some
// axis separates them by at least `clearance` metres.
function footprintsOverlap(a: Box, b: Box, clearance: number): boolean {
  const axes = [rightOf(a.angle), frontOf(a.angle), rightOf(b.angle), frontOf(b.angle)]
  const ca = corners(a)
  const cb = corners(b)
  for (const axis of axes) {
    const pa = ca.map((p) => dot(p, axis))
    const pb = cb.map((p) => dot(p, axis))
    if (
      Math.max(...pa) + clearance <= Math.min(...pb) ||
      Math.max(...pb) + clearance <= Math.min(...pa)
    ) {
      return false
    }
  }
  return true
}

// Do two boxes collide (footprints overlap, with clearance, and heights overlap)?
export function collides(a: Box, b: Box, clearance = 0.05): boolean {
  if (a.y1 <= b.y0 + 1e-6 || b.y1 <= a.y0 + 1e-6) return false
  return footprintsOverlap(a, b, clearance)
}

function distanceToSegment(p: Vec2, s: Vec2, e: Vec2): number {
  const d = sub(e, s)
  const len2 = dot(d, d)
  const t = len2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, s), d) / len2)) : 0
  const q = add(s, scale(d, t))
  return Math.hypot(p.x - q.x, p.z - q.z)
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const cross = (o: Vec2, p: Vec2, q: Vec2) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x)
  const d1 = cross(c, d, a)
  const d2 = cross(c, d, b)
  const d3 = cross(a, b, c)
  const d4 = cross(a, b, d)
  return d1 * d2 < -1e-12 && d3 * d4 < -1e-12
}

// Is the footprint fully inside the room, at least `margin` from its walls
// (wall centre lines run along the polygon edges)? Works for concave rooms.
export function insideRoom(box: Box, polygon: Vec2[], margin: number): boolean {
  const cs = corners(box)
  for (const c of cs) {
    if (!pointInPolygon(c, polygon)) return false
  }
  for (let i = 0; i < polygon.length; i++) {
    const s = polygon[i]
    const e = polygon[(i + 1) % polygon.length]
    for (let k = 0; k < 4; k++) {
      if (segmentsCross(cs[k], cs[(k + 1) % 4], s, e)) return false
    }
    // Wall thickness: corners must keep clear of the centre line.
    for (const c of cs) {
      if (distanceToSegment(c, s, e) < margin - 1e-6) return false
    }
  }
  return true
}

export function polygonArea(poly: Vec2[]): number {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}

// Area centroid (falls back to the vertex mean for degenerate polygons).
export function centroid(poly: Vec2[]): Vec2 {
  const a = polygonArea(poly)
  if (Math.abs(a) < 1e-9) {
    return scale(
      poly.reduce((s, p) => add(s, p), { x: 0, z: 0 }),
      1 / poly.length,
    )
  }
  let cx = 0
  let cz = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const f = p.x * q.z - q.x * p.z
    cx += (p.x + q.x) * f
    cz += (p.z + q.z) * f
  }
  return { x: cx / (6 * a), z: cz / (6 * a) }
}

export interface Edge {
  start: Vec2
  end: Vec2
  length: number
  // Unit direction along the edge and unit normal pointing into the room.
  dir: Vec2
  inward: Vec2
}

// Room edges, longest first (ties keep polygon order), with inward normals.
export function roomEdges(poly: Vec2[]): Edge[] {
  const ccw = polygonArea(poly) > 0
  const edges: Edge[] = []
  for (let i = 0; i < poly.length; i++) {
    const start = poly[i]
    const end = poly[(i + 1) % poly.length]
    const length = Math.hypot(end.x - start.x, end.z - start.z)
    if (length < 1e-6) continue
    const dir = { x: (end.x - start.x) / length, z: (end.z - start.z) / length }
    // In x/z with this winding, the left-hand normal (-dz, dx) points inside for a
    // positive-area polygon; flip it otherwise.
    const left = { x: -dir.z, z: dir.x }
    const inward = ccw ? left : scale(left, -1)
    edges.push({ start, end, length, dir, inward })
  }
  // Check the guess on the first edge's midpoint and flip all if it's wrong
  // (keeps us independent of the axis handedness used to compute area).
  if (edges.length) {
    const e = edges[0]
    const mid = add(scale(add(e.start, e.end), 0.5), scale(e.inward, 0.01))
    if (!pointInPolygon(mid, poly)) for (const ed of edges) ed.inward = scale(ed.inward, -1)
  }
  return edges
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.length - a.e.length || a.i - b.i)
    .map(({ e }) => e)
}
