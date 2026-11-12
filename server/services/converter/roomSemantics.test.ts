import { test } from 'vitest'
import assert from 'node:assert/strict'
import { convertCanvasToScene } from './index'
import { describeRoom, pointInPolygon, roomTypeFromName, roomTypeFromShape } from './roomSemantics'
import { assignAssetRooms, carryOverEditorContent } from './sceneAssets'
import type { CanvasV2, SceneAsset, SceneV1, Vec2 } from './types'

const rect = (x0: number, z0: number, x1: number, z1: number): Vec2[] => [
  { x: x0, z: z0 },
  { x: x1, z: z0 },
  { x: x1, z: z1 },
  { x: x0, z: z1 },
]

test('pointInPolygon: inside, outside, concave notch', () => {
  const square = rect(0, 0, 4, 4)
  assert.equal(pointInPolygon({ x: 2, z: 2 }, square), true)
  assert.equal(pointInPolygon({ x: 5, z: 2 }, square), false)
  // L-shape: the notch at the top right is outside.
  const ell: Vec2[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 2 },
    { x: 2, z: 2 },
    { x: 2, z: 4 },
    { x: 0, z: 4 },
  ]
  assert.equal(pointInPolygon({ x: 1, z: 3 }, ell), true)
  assert.equal(pointInPolygon({ x: 3, z: 3 }, ell), false)
})

test('roomTypeFromName recognises common names, first match wins', () => {
  assert.equal(roomTypeFromName('Master Bedroom'), 'bedroom')
  assert.equal(roomTypeFromName('Bedroom2'), 'bedroom')
  assert.equal(roomTypeFromName('Master Bath'), 'bathroom')
  assert.equal(roomTypeFromName('WC'), 'bathroom')
  assert.equal(roomTypeFromName('Living / Dining'), 'living')
  assert.equal(roomTypeFromName('Dining'), 'dining')
  assert.equal(roomTypeFromName('Kitchen'), 'kitchen')
  assert.equal(roomTypeFromName('Study'), 'office')
  assert.equal(roomTypeFromName('Hallway'), 'hallway')
  assert.equal(roomTypeFromName('Garden'), null)
  // "den" only as a whole word, not inside other words.
  assert.equal(roomTypeFromName('Garden shed'), null)
})

test('roomTypeFromShape: corridor, small, medium, large', () => {
  assert.equal(roomTypeFromShape(rect(0, 0, 6, 1.2), 7.2), 'hallway')
  assert.equal(roomTypeFromShape(rect(0, 0, 1, 1.5), 1.5), 'other')
  assert.equal(roomTypeFromShape(rect(0, 0, 2, 2.5), 5), 'bathroom')
  assert.equal(roomTypeFromShape(rect(0, 0, 3, 4), 12), 'bedroom')
  assert.equal(roomTypeFromShape(rect(0, 0, 5, 5), 25), 'living')
})

test('describeRoom uses the first non-empty label inside, else the shape', () => {
  const poly = rect(0, 0, 3, 4)
  const labels = [
    { position: { x: 10, z: 10 }, text: 'Kitchen' }, // outside
    { position: { x: 1, z: 1 }, text: '   ' }, // blank
    { position: { x: 2, z: 2 }, text: ' Guest Room ' },
    { position: { x: 1, z: 3 }, text: 'Office' }, // second label inside: ignored
  ]
  assert.deepEqual(describeRoom(poly, 12, labels), { name: 'Guest Room', type: 'bedroom' })
  assert.deepEqual(describeRoom(poly, 12, []), { type: 'bedroom' })
  // An unrecognised name keeps the name; the type falls back to the shape.
  assert.deepEqual(describeRoom(poly, 12, [{ position: { x: 1, z: 1 }, text: 'Studio' }]), {
    name: 'Studio',
    type: 'bedroom',
  })
})

// Two rooms side by side (4 m × 3 m each) with a label in the right one.
const twoRooms: CanvasV2 = {
  version: 'canvas-v2',
  scale: { pixelsPerMetre: 100 },
  wallHeight: 2.8,
  walls: [
    { id: 'a', start: { x: 0, y: 0 }, end: { x: 400, y: 0 }, thickness: 10 },
    { id: 'b', start: { x: 400, y: 0 }, end: { x: 800, y: 0 }, thickness: 10 },
    { id: 'c', start: { x: 800, y: 0 }, end: { x: 800, y: 300 }, thickness: 10 },
    { id: 'd', start: { x: 800, y: 300 }, end: { x: 400, y: 300 }, thickness: 10 },
    { id: 'e', start: { x: 400, y: 300 }, end: { x: 0, y: 300 }, thickness: 10 },
    { id: 'f', start: { x: 0, y: 300 }, end: { x: 0, y: 0 }, thickness: 10 },
    { id: 'g', start: { x: 400, y: 0 }, end: { x: 400, y: 300 }, thickness: 10 },
  ],
  openings: [],
  labels: [{ id: 'l1', position: { x: 600, y: 150 }, text: 'Kitchen' }],
}

test('converter names and types rooms from 2D labels', () => {
  const scene = convertCanvasToScene(twoRooms)
  const rooms = scene.rooms ?? []
  assert.equal(rooms.length, 2)
  const kitchen = rooms.find((r) => r.name === 'Kitchen')
  assert.ok(kitchen, 'the labelled room is named')
  assert.equal(kitchen.type, 'kitchen')
  const other = rooms.find((r) => r !== kitchen)!
  assert.equal(other.name, undefined)
  assert.equal(other.type, 'bedroom') // 12 m², no label
})

const asset = (id: string, x: number, z: number, extra: Partial<SceneAsset> = {}): SceneAsset => ({
  id,
  kind: 'model',
  source: '/static/furniture/chair.glb',
  transform: {
    position: { x, y: 0, z },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  },
  ...extra,
})

test('assignAssetRooms sets roomId from position and clears stale ids', () => {
  const scene = convertCanvasToScene(twoRooms)
  const kitchenId = scene.rooms!.find((r) => r.name === 'Kitchen')!.id
  const withAssets: SceneV1 = {
    ...scene,
    assets: [asset('in', 6, 1.5), asset('out', 20, 20, { roomId: 'stale' })],
  }
  const out = assignAssetRooms(withAssets)
  assert.equal(out.assets![0].roomId, kitchenId)
  assert.equal('roomId' in out.assets![1], false)
})

test('carryOverEditorContent keeps assets, their materials and point lights', () => {
  const fresh = convertCanvasToScene(twoRooms)
  const previous: SceneV1 = {
    ...fresh,
    assets: [asset('sofa', 2, 1.5, { materialId: 'mat-sofa' })],
    materials: [
      ...(fresh.materials ?? []),
      { id: 'mat-sofa', color: '#ff0000' },
      { id: 'unused', color: '#00ff00' },
    ],
    lighting: {
      ...fresh.lighting,
      lights: [
        ...(fresh.lighting?.lights ?? []),
        {
          id: 'bulb',
          type: 'point',
          color: '#ffffff',
          intensity: 3,
          position: { x: 1, y: 2, z: 1 },
        },
      ],
    },
  }
  const next = carryOverEditorContent(previous, convertCanvasToScene(twoRooms))
  assert.deepEqual(
    next.assets!.map((a) => a.id),
    ['sofa'],
  )
  assert.ok(next.assets![0].roomId, 'room re-assigned against the new rooms')
  assert.deepEqual(
    next.materials!.map((m) => m.id),
    ['wall-default', 'mat-sofa'],
  )
  assert.deepEqual(
    next.lighting!.lights!.map((l) => l.id),
    ['sun', 'bulb'],
  )
})

test('carryOverEditorContent ignores old glTF saves and empty history', () => {
  const fresh = convertCanvasToScene(twoRooms)
  assert.deepEqual(carryOverEditorContent({ format: 'gltf', gltf: {} }, fresh).assets, [])
  assert.deepEqual(carryOverEditorContent(undefined, fresh).assets, [])
})
