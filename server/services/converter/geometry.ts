import type { Point } from './types'

// Pure 2D helpers for placing openings on walls. All inputs/outputs in canvas
// pixels; deterministic (no randomness, no time).

// Parametric position (0..1, clamped to the segment) of point P projected onto
// the segment S->E. 0 = at S, 1 = at E. A zero-length segment returns 0.
export function projectParam(p: Point, s: Point, e: Point): number {
  const dx = e.x - s.x
  const dy = e.y - s.y
  const len2 = dx * dx + dy * dy
  if (len2 === 0) return 0
  const t = ((p.x - s.x) * dx + (p.y - s.y) * dy) / len2
  return Math.min(1, Math.max(0, t))
}

// Shortest distance from point P to the segment S->E.
export function distanceToSegment(p: Point, s: Point, e: Point): number {
  const t = projectParam(p, s, e)
  const cx = s.x + t * (e.x - s.x)
  const cy = s.y + t * (e.y - s.y)
  return Math.hypot(p.x - cx, p.y - cy)
}
