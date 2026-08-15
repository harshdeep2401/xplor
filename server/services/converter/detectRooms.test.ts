import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectRooms } from './detectRooms'
import type { Vec2 } from './types'

const seg = (ax: number, az: number, bx: number, bz: number) => ({
  start: { x: ax, z: az } as Vec2,
  end: { x: bx, z: bz } as Vec2,
})

// A closed square 4m × 4m → exactly one room of area 16.
const square = [seg(0, 0, 4, 0), seg(4, 0, 4, 4), seg(4, 4, 0, 4), seg(0, 4, 0, 0)]

test('a closed square is one room with the right area', () => {
  const rooms = detectRooms(square)
  assert.equal(rooms.length, 1)
  assert.ok(Math.abs(rooms[0].area - 16) < 1e-6)
})

test('an open (unclosed) wall run yields no rooms', () => {
  const open = [seg(0, 0, 4, 0), seg(4, 0, 4, 4)] // just an L, not enclosed
  assert.deepEqual(detectRooms(open), [])
})

test('two rooms sharing a wall are both detected', () => {
  // Two 4×4 squares side by side sharing the middle wall x=4.
  const walls = [
    seg(0, 0, 4, 0),
    seg(4, 0, 8, 0),
    seg(8, 0, 8, 4),
    seg(8, 4, 4, 4),
    seg(4, 4, 0, 4),
    seg(0, 4, 0, 0),
    seg(4, 0, 4, 4), // shared middle wall
  ]
  const rooms = detectRooms(walls)
  assert.equal(rooms.length, 2)
  for (const r of rooms) assert.ok(Math.abs(r.area - 16) < 1e-6)
})

test('a dangling spur wall does not create a false room', () => {
  const walls = [...square, seg(4, 4, 6, 6)] // spur sticking out of a corner
  const rooms = detectRooms(walls)
  assert.equal(rooms.length, 1)
  assert.ok(Math.abs(rooms[0].area - 16) < 1e-6)
})
