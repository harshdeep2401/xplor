import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weldWalls } from './weldWalls'
import { detectionToCanvas, convertCanvasToScene } from './index'
import type { CanvasV1Wall } from './types'

const wall = (id: string, x1: number, y1: number, x2: number, y2: number): CanvasV1Wall => ({
  id, type: 'wall', startX: x1, startY: y1, endX: x2, endY: y2, thickness: 8,
})
const ends = (w: CanvasV1Wall) => [w.startX, w.startY, w.endX, w.endY]

test('an L-corner with a gap is welded to one shared point', () => {
  const out = weldWalls([wall('a', 0, 0, 294, 0), wall('b', 300, 6, 300, 200)])
  assert.deepEqual(out.map(ends), [[0, 0, 300, 0], [300, 0, 300, 200]])
})

test('an overshooting corner is trimmed back to the intersection', () => {
  const out = weldWalls([wall('a', 0, 0, 310, 0), wall('b', 300, -8, 300, 200)])
  assert.deepEqual(out.map(ends), [[0, 0, 300, 0], [300, 0, 300, 200]])
})

test('a T-junction welds the stem and splits the crossbar', () => {
  const out = weldWalls([wall('top', 0, 0, 400, 0), wall('stem', 200, 12, 200, 300)])
  assert.deepEqual(
    out.map((w) => [w.id, ...ends(w)]),
    [
      ['top_1', 0, 0, 200, 0],
      ['top_2', 200, 0, 400, 0],
      ['stem', 200, 0, 200, 300],
    ],
  )
})

test('far-apart and parallel walls are left alone', () => {
  const input = [wall('a', 0, 0, 100, 0), wall('b', 0, 10, 100, 10), wall('c', 300, 300, 300, 400)]
  assert.deepEqual(weldWalls(input), input)
})

// Shape of real opencv-heuristic output on a 2-room plan: walls sit on the stroke
// edges, so no corner meets. After welding, both rooms close and get floors.
test('detector-style gaps still produce rooms in 3D', () => {
  const canvas = detectionToCanvas({
    walls: [
      { id: 'b', startX: 99, startY: 605, endX: 901, endY: 605 },
      { id: 't', startX: 101, startY: 94, endX: 899, endY: 94 },
      { id: 'r', startX: 905, startY: 601, endX: 905, endY: 99 },
      { id: 'l', startX: 94, startY: 599, endX: 94, endY: 101 },
      { id: 'm', startX: 505, startY: 593, endX: 505, endY: 107 },
    ],
  })
  const scene = convertCanvasToScene(canvas)
  assert.equal(scene.rooms?.length, 2)
})
