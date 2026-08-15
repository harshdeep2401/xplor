// Pure geometry: split a wall (with door/window openings) into solid box pieces,
// leaving voids where the openings are. No THREE — just interval math — so it's
// deterministic and unit-testable. buildFromSceneV1.ts turns these pieces into
// meshes.
//
// Coordinates are in the wall's LOCAL frame:
//   u = distance along the wall from its start (metres), 0..length
//   y = height above the floor (metres), 0..wall height
// Each opening carves a rectangular void [uStart,uEnd] × [voidBottom,voidTop].
// The remaining solid = full-height pieces in the gaps + a header above each
// opening + a sill below each window (doors have sill 0, so no sill piece).

export interface WallOpeningSpec {
  center: number // 0..1 along the wall
  width: number // metres along the wall
  height: number // metres (vertical opening size)
  sillHeight?: number // metres above the floor (0 for doors)
}

export interface WallPieceInput {
  length: number // wall length (metres)
  height: number // wall height (metres)
  openings?: WallOpeningSpec[]
}

// A solid box piece in the wall's local frame.
export interface WallPiece {
  uStart: number
  uEnd: number
  yBottom: number
  yTop: number
}

export function computeWallPieces(wall: WallPieceInput): WallPiece[] {
  const L = wall.length
  const H = wall.height
  if (L <= 0 || H <= 0) return []

  // Clamp each opening to the wall and drop degenerate ones.
  const voids = (wall.openings ?? [])
    .map((o) => {
      const half = o.width / 2
      const uStart = Math.max(0, o.center * L - half)
      const uEnd = Math.min(L, o.center * L + half)
      const voidBottom = Math.max(0, o.sillHeight ?? 0)
      const voidTop = Math.min(H, voidBottom + o.height)
      return { uStart, uEnd, voidBottom, voidTop }
    })
    .filter((v) => v.uEnd > v.uStart && v.voidTop > v.voidBottom)

  if (voids.length === 0) {
    return [{ uStart: 0, uEnd: L, yBottom: 0, yTop: H }]
  }

  const pieces: WallPiece[] = []

  // Full-height solids = the complement of the UNION of opening spans, so
  // overlapping openings don't produce overlapping side pieces.
  const merged: { uStart: number; uEnd: number }[] = []
  for (const v of [...voids].sort((a, b) => a.uStart - b.uStart)) {
    const last = merged[merged.length - 1]
    if (last && v.uStart <= last.uEnd) {
      last.uEnd = Math.max(last.uEnd, v.uEnd)
    } else {
      merged.push({ uStart: v.uStart, uEnd: v.uEnd })
    }
  }
  let cursor = 0
  for (const m of merged) {
    if (m.uStart > cursor) pieces.push({ uStart: cursor, uEnd: m.uStart, yBottom: 0, yTop: H })
    cursor = m.uEnd
  }
  if (cursor < L) pieces.push({ uStart: cursor, uEnd: L, yBottom: 0, yTop: H })

  // Header above each opening; sill below each window.
  for (const v of voids) {
    if (v.voidTop < H) pieces.push({ uStart: v.uStart, uEnd: v.uEnd, yBottom: v.voidTop, yTop: H })
    if (v.voidBottom > 0) pieces.push({ uStart: v.uStart, uEnd: v.uEnd, yBottom: 0, yTop: v.voidBottom })
  }

  return pieces
}
