import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  detectionToCanvas,
  convertCanvasToScene,
  validateCanvasV2,
  validateDetectionV1,
} from './index'
import type { CanvasV2, DetectionV1 } from './types'

// A representative detector result exercising the bridge's cases: an explicit and
// a defaulted wall thickness, a zero-length wall (noise, dropped), a door with no
// width (defaulted) that snaps to a wall, a window with a width, a door too far
// from any wall (dropped by the snap), and rooms (ignored).
const detection: DetectionV1 = {
  walls: [
    { id: 'w1', startX: 0, startY: 0, endX: 300, endY: 0, thickness: 10 },
    { id: 'w2', startX: 300, startY: 0, endX: 300, endY: 200 },
    { id: 'w0', startX: 50, startY: 50, endX: 50, endY: 50, thickness: 8 },
  ],
  rooms: [{ id: 'r1', points: [[0, 0], [300, 0], [300, 200], [0, 200]], areaPx: 60000 }],
  doors: [
    { id: 'd1', x: 120, y: 2 },
    { id: 'd2', x: 500, y: 500, width: 40 },
  ],
  windows: [{ id: 'win1', x: 300, y: 100, width: 60 }],
}

// Golden output at 50 px/m and 3 m walls. d1 snaps to w1 at 120/300 = 0.4 with the
// 36 px default width; win1 sits on w2 at 100/200 = 0.5. Windows come before doors
// (normalizeCanvas order).
const expectedCanvas: CanvasV2 = {
  version: 'canvas-v2',
  scale: { pixelsPerMetre: 50 },
  wallHeight: 3,
  walls: [
    { id: 'w1', start: { x: 0, y: 0 }, end: { x: 300, y: 0 }, thickness: 10 },
    { id: 'w2', start: { x: 300, y: 0 }, end: { x: 300, y: 200 }, thickness: 8 },
  ],
  openings: [
    { id: 'win1', type: 'window', wallId: 'w2', offset: 0.5, width: 60, height: 1.2, sillHeight: 0.9 },
    { id: 'd1', type: 'door', wallId: 'w1', offset: 0.4, width: 36, height: 2.1, sillHeight: 0 },
  ],
  labels: [],
}

const defaults = { pixelsPerMetre: 50, wallHeight: 3 }

test('golden: detection-v1 bridges to the expected canvas-v2', () => {
  assert.ok(validateDetectionV1(detection), 'fixture must be valid detection-v1')
  const canvas = detectionToCanvas(detection, defaults)
  assert.deepEqual(canvas, expectedCanvas)
  assert.ok(validateCanvasV2(canvas), 'bridged canvas must be valid canvas-v2')
})

test('bridge is deterministic', () => {
  const a = JSON.stringify(detectionToCanvas(detection, defaults))
  const b = JSON.stringify(detectionToCanvas(structuredClone(detection), defaults))
  assert.equal(a, b)
})

test('bridged canvas converts to a 3D scene', () => {
  const scene = convertCanvasToScene(detectionToCanvas(detection, defaults))
  assert.equal(scene.walls.length, 2)
  // 300 px at 50 px/m -> 6 m
  assert.deepEqual(scene.walls[0].end, { x: 6, z: 0 })
})

test('empty detection yields an empty but valid canvas-v2', () => {
  const canvas = detectionToCanvas({}, defaults)
  assert.deepEqual(canvas.walls, [])
  assert.ok(validateCanvasV2(canvas))
})

test('bounding-box style output is rejected by detection-v1', () => {
  assert.equal(validateDetectionV1({ walls: [{ id: 'w', x: 0, y: 0, w: 10, h: 2 }] }), false)
})
