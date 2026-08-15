import type { Vec2 } from './types'

// Detect enclosed rooms (floor polygons) from wall segments by finding the
// bounded faces of the wall graph. Pure + deterministic.
//
// Method (planar-subdivision face traversal):
//   1. Merge coincident endpoints into shared vertices.
//   2. Build the undirected graph of walls; at each vertex sort neighbours by angle.
//   3. Walk half-edges with the "next = clockwise neighbour of the reverse edge"
//      rule. Each closed walk is a face. Bounded faces come out counter-clockwise
//      (signed area > 0); the single unbounded outer face comes out clockwise
//      (< 0). Dangling/spur walls trace zero-area walks. Keep the CCW faces.
//
// Coordinates are scene metres (XZ floor plane).

export interface DetectedRoom {
  floorPolygon: Vec2[]
  area: number
}

const EPS = 1e-6
const QUANT = 1000 // vertex-merge precision: 1/1000 m = 1 mm

export function detectRooms(walls: { start: Vec2; end: Vec2 }[]): DetectedRoom[] {
  if (walls.length < 3) return []

  // 1. Merge coincident endpoints → vertex ids.
  const verts: Vec2[] = []
  const idOf = new Map<string, number>()
  const vid = (p: Vec2): number => {
    const key = `${Math.round(p.x * QUANT)}:${Math.round(p.z * QUANT)}`
    let i = idOf.get(key)
    if (i === undefined) {
      i = verts.length
      verts.push({ x: p.x, z: p.z })
      idOf.set(key, i)
    }
    return i
  }

  // 2. Undirected adjacency.
  const adj = new Map<number, Set<number>>()
  const link = (a: number, b: number): void => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }
  for (const w of walls) link(vid(w.start), vid(w.end))

  const angle = (from: number, to: number): number =>
    Math.atan2(verts[to].z - verts[from].z, verts[to].x - verts[from].x)

  const sortedNbr = new Map<number, number[]>()
  for (const [v, set] of adj) {
    sortedNbr.set(v, [...set].sort((a, b) => angle(v, a) - angle(v, b)))
  }

  // 3. Face traversal over directed half-edges.
  const visited = new Set<string>()
  const hk = (a: number, b: number): string => `${a}>${b}`
  const rooms: DetectedRoom[] = []

  for (const [v0, set] of adj) {
    for (const u0 of set) {
      if (visited.has(hk(v0, u0))) continue

      const face: number[] = []
      let a = v0
      let b = u0
      let guard = 0
      while (!visited.has(hk(a, b))) {
        if (++guard > 100000) break // safety against malformed graphs
        visited.add(hk(a, b))
        face.push(a)
        const nbrs = sortedNbr.get(b)!
        const idx = nbrs.indexOf(a)
        const next = nbrs[(idx - 1 + nbrs.length) % nbrs.length]
        a = b
        b = next
      }

      if (face.length < 3) continue
      const poly = face.map((i) => verts[i])
      const s = signedArea(poly)
      // Bounded faces are CCW (s > 0); keep them. Outer face (s < 0) and
      // zero-area spur walks are discarded.
      if (s > EPS) rooms.push({ floorPolygon: poly, area: s })
    }
  }

  return rooms
}

function signedArea(poly: Vec2[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    s += a.x * b.z - b.x * a.z
  }
  return s / 2
}
