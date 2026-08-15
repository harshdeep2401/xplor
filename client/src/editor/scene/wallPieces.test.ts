import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeWallPieces, type WallPiece } from './wallPieces'

// Total solid area of the pieces (metres²), for conservation checks.
const area = (pieces: WallPiece[]) =>
  pieces.reduce((s, p) => s + (p.uEnd - p.uStart) * (p.yTop - p.yBottom), 0)

test('a plain wall is one full piece', () => {
  const p = computeWallPieces({ length: 4, height: 2.8 })
  assert.deepEqual(p, [{ uStart: 0, uEnd: 4, yBottom: 0, yTop: 2.8 }])
})

test('a door (sill 0) carves a floor-level void: left, right, header — no sill', () => {
  // door centred at u=2 on a 4m wall, 1m wide, 2.1m tall
  const p = computeWallPieces({
    length: 4,
    height: 2.8,
    openings: [{ center: 0.5, width: 1, height: 2.1, sillHeight: 0 }],
  })
  // side pieces [0,1.5] and [2.5,4] full height, header [1.5,2.5]×[2.1,2.8], no sill
  assert.deepEqual(
    p.map((x) => `${x.uStart}-${x.uEnd}|${x.yBottom}-${x.yTop}`).sort(),
    ['0-1.5|0-2.8', '1.5-2.5|2.1-2.8', '2.5-4|0-2.8'].sort(),
  )
  // conservation: wall area (4×2.8=11.2) minus door void (1×2.1=2.1) = 9.1
  assert.ok(Math.abs(area(p) - 9.1) < 1e-9)
})

test('a window (raised sill) adds a sill piece below the void', () => {
  const p = computeWallPieces({
    length: 4,
    height: 2.8,
    openings: [{ center: 0.5, width: 1, height: 1.2, sillHeight: 0.9 }],
  })
  const spans = p.map((x) => `${x.uStart}-${x.uEnd}|${x.yBottom}-${x.yTop}`).sort()
  // sides + header [1.5,2.5]×[2.1,2.8] + sill [1.5,2.5]×[0,0.9]
  assert.deepEqual(
    spans,
    ['0-1.5|0-2.8', '1.5-2.5|0-0.9', '1.5-2.5|2.1-2.8', '2.5-4|0-2.8'].sort(),
  )
  // 11.2 minus window void (1×1.2=1.2) = 10.0
  assert.ok(Math.abs(area(p) - 10.0) < 1e-9)
})

test('two openings leave the correct middle gap', () => {
  const p = computeWallPieces({
    length: 6,
    height: 3,
    openings: [
      { center: 0.25, width: 1, height: 2.1, sillHeight: 0 }, // u 1..2
      { center: 0.75, width: 1, height: 2.1, sillHeight: 0 }, // u 4..5
    ],
  })
  const fullHeight = p.filter((x) => x.yBottom === 0 && x.yTop === 3).map((x) => `${x.uStart}-${x.uEnd}`).sort()
  // solids: [0,1], [2,4], [5,6]
  assert.deepEqual(fullHeight, ['0-1', '2-4', '5-6'].sort())
})

test('degenerate wall yields no pieces', () => {
  assert.deepEqual(computeWallPieces({ length: 0, height: 2.8 }), [])
})
