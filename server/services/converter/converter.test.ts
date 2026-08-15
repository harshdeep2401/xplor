import { test } from 'node:test'
import assert from 'node:assert/strict'
import { convertCanvasToScene, ConverterError, normalizeCanvas } from './index'
import type { CanvasV1, SceneV1 } from './types'

// A representative legacy canvas-v1 payload exercising every element type plus
// the tricky cases: a door that snaps to a wall, a window attached by id, and a
// door too far from any wall (dropped).
const legacyCanvas: CanvasV1 = {
  elements: [
    { id: 'w1', type: 'wall', startX: 0, startY: 0, endX: 300, endY: 0, thickness: 8 },
    { id: 'w2', type: 'wall', startX: 300, startY: 0, endX: 300, endY: 200, thickness: 8 },
    { id: 'd1', type: 'door', x: 120, y: 2, width: 40, height: 80, rotation: 0 },
    {
      id: 'win1', type: 'window', x: 300, y: 100, startX: 300, startY: 80,
      width: 60, height: 40, rotation: 0, curvature: 0, attachedWallId: 'w2',
    },
    { id: 'lab1', type: 'label', x: 50, y: 50, text: 'Kitchen', fontSize: 16 },
    { id: 'd2', type: 'door', x: 500, y: 500, width: 40, height: 80, rotation: 0 },
  ],
}

// Golden output. Default scale 100 px/m: 300px -> 3m, 200px -> 2m, 8px -> 0.08m,
// 40px -> 0.4m, 60px -> 0.6m. Door d1 snaps to w1 at offset 120/300 = 0.4;
// window win1 sits on w2 at 100/200 = 0.5; door d2 is dropped (too far).
const expectedScene: SceneV1 = {
  version: 'scene-v1',
  units: 'metre',
  walls: [
    {
      id: 'w1',
      start: { x: 0, z: 0 },
      end: { x: 3, z: 0 },
      thickness: 0.08,
      height: 2.8,
      materialId: 'wall-default',
      openings: [
        { id: 'd1', type: 'door', center: 0.4, width: 0.4, height: 2.1, sillHeight: 0 },
      ],
    },
    {
      id: 'w2',
      start: { x: 3, z: 0 },
      end: { x: 3, z: 2 },
      thickness: 0.08,
      height: 2.8,
      materialId: 'wall-default',
      openings: [
        { id: 'win1', type: 'window', center: 0.5, width: 0.6, height: 1.2, sillHeight: 0.9 },
      ],
    },
  ],
  rooms: [],
  assets: [],
  lighting: {
    ambient: { color: '#ffffff', intensity: 0.6 },
    lights: [
      {
        id: 'sun', type: 'directional', color: '#ffffff', intensity: 1,
        position: { x: 5, y: 10, z: 5 }, target: { x: 0, y: 0, z: 0 },
      },
    ],
  },
  materials: [
    { id: 'wall-default', name: 'Wall', color: '#e8e8e8', roughness: 0.9, metalness: 0 },
  ],
}

test('converts a legacy canvas to the expected scene (golden)', () => {
  const scene = convertCanvasToScene(legacyCanvas)
  assert.deepEqual(scene, expectedScene)
})

test('is deterministic: same input -> byte-identical output', () => {
  const a = JSON.stringify(convertCanvasToScene(legacyCanvas))
  const b = JSON.stringify(convertCanvasToScene(legacyCanvas))
  assert.equal(a, b)
})

test('drops openings that are too far from any wall', () => {
  const scene = convertCanvasToScene(legacyCanvas)
  const ids = scene.walls.flatMap((w) => (w.openings ?? []).map((o) => o.id))
  assert.ok(!ids.includes('d2'), 'far door d2 should be dropped')
  assert.deepEqual(ids.sort(), ['d1', 'win1'])
})

test('an empty canvas produces a valid, empty-structure scene', () => {
  const scene = convertCanvasToScene({ elements: [] })
  assert.equal(scene.version, 'scene-v1')
  assert.deepEqual(scene.walls, [])
  assert.deepEqual(scene.rooms, [])
})

test('passes through a payload already in canvas-v2', () => {
  const v2 = normalizeCanvas({
    version: 'canvas-v2',
    scale: { pixelsPerMetre: 100 },
    wallHeight: 3,
    walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thickness: 10 }],
  })
  assert.equal(v2.scale.pixelsPerMetre, 100)
  assert.equal(v2.wallHeight, 3)
})

test('rejects an invalid canvas-v2 payload at the boundary', () => {
  // offset 2 is out of the [0,1] range -> canvas-v2 validation must fail.
  const bad = {
    version: 'canvas-v2',
    scale: { pixelsPerMetre: 50 },
    wallHeight: 2.7,
    walls: [{ id: 'w', start: { x: 0, y: 0 }, end: { x: 1, y: 0 }, thickness: 8 }],
    openings: [{ id: 'o', type: 'door', wallId: 'w', offset: 2, width: 40, height: 2.1 }],
  }
  assert.throws(() => convertCanvasToScene(bad), ConverterError)
})
