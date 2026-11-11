import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import {
  objectsToSceneV1,
  sceneV1ToObjects,
  planOffset,
  type LoadDeps,
  type SceneV1,
} from './sceneV1'
import { createPrimitiveObject, fitToSize, guessBaseSize, measure } from '../scene/models'
import { createLight } from '../lights/createLight'
import { getMeta, setMeta } from '../scene/objectMeta'
import { buildSceneObjectsFromSceneV1 } from '../scene/buildFromSceneV1'
import { deleteObject } from '../actions/deleteObjects'
import { updateObjectColor } from '../actions/updateObjects'

// A 4 m × 2 m room whose plan sits away from the origin (centre at x=12, z=6),
// so the editor's recentring offset is exercised.
const plan: SceneV1 = {
  version: 'scene-v1',
  units: 'metre',
  walls: [
    { id: 'a', start: { x: 10, z: 5 }, end: { x: 14, z: 5 }, thickness: 0.1, height: 2.8 },
    { id: 'b', start: { x: 14, z: 5 }, end: { x: 14, z: 7 }, thickness: 0.1, height: 2.8 },
    { id: 'c', start: { x: 14, z: 7 }, end: { x: 10, z: 7 }, thickness: 0.1, height: 2.8 },
    { id: 'd', start: { x: 10, z: 7 }, end: { x: 10, z: 5 }, thickness: 0.1, height: 2.8 },
  ],
  rooms: [
    {
      id: 'room-0',
      name: 'Kitchen',
      type: 'kitchen',
      floorPolygon: [
        { x: 10, z: 5 },
        { x: 14, z: 5 },
        { x: 14, z: 7 },
        { x: 10, z: 7 },
      ],
      area: 8,
    },
  ],
  assets: [],
  lighting: {
    ambient: { color: '#ffffff', intensity: 0.6 },
    lights: [{ id: 'sun', type: 'directional', color: '#ffffff', intensity: 1 }],
  },
  materials: [{ id: 'wall-default', color: '#e8e8e8' }],
}

// Stand-in for loading a GLB: a 2 × 1 × 0.5 box authored in centimetres.
const fakeModel: LoadDeps['createModel'] = async (opts) => {
  const content = new THREE.Mesh(
    new THREE.BoxGeometry(200, 100, 50),
    new THREE.MeshStandardMaterial(),
  )
  const baseSize = opts.baseSize ?? guessBaseSize(measure(content))
  fitToSize(content, baseSize)
  const wrapper = new THREE.Group()
  wrapper.add(content)
  setMeta(wrapper, { kind: 'model', source: opts.source, catalogId: opts.catalogId, baseSize })
  return { id: crypto.randomUUID(), name: opts.name, object3d: wrapper }
}
const deps: LoadDeps = {
  createModel: fakeModel,
  createPrimitive: createPrimitiveObject,
  loadTexture: async () => new THREE.Texture(),
}

test('planOffset is the plan centre', () => {
  assert.deepEqual(planOffset(plan), { x: 12, z: 6 })
  assert.deepEqual(planOffset(null), { x: 0, z: 0 })
})

test('fitToSize makes a model measure exactly its base size, standing on the origin', () => {
  const content = new THREE.Mesh(new THREE.BoxGeometry(200, 100, 50))
  content.position.set(30, 40, 50)
  fitToSize(content, { x: 1.6, y: 0.9, z: 0.8 })
  const box = new THREE.Box3().setFromObject(content)
  const size = box.getSize(new THREE.Vector3())
  assert.ok(
    Math.abs(size.x - 1.6) < 1e-9 && Math.abs(size.y - 0.9) < 1e-9 && Math.abs(size.z - 0.8) < 1e-9,
  )
  assert.ok(Math.abs(box.min.y) < 1e-9, 'bottom on the floor')
  const c = box.getCenter(new THREE.Vector3())
  assert.ok(Math.abs(c.x) < 1e-9 && Math.abs(c.z) < 1e-9, 'centred')
})

test('guessBaseSize keeps furniture-sized models and shrinks centimetre ones', () => {
  assert.deepEqual(guessBaseSize({ x: 1, y: 0.5, z: 0.5 }), { x: 1, y: 0.5, z: 0.5 })
  const s = guessBaseSize({ x: 200, y: 100, z: 50 })
  assert.ok(Math.abs(s.x - 1.2) < 1e-9 && Math.abs(s.y - 0.6) < 1e-9)
})

test('save → load round trip keeps assets, colours, lights and the plan', async () => {
  const offset = planOffset(plan)
  const loaded = await sceneV1ToObjects(plan, offset, deps)
  assert.equal(loaded.objects.length, 5, '4 walls + 1 floor')

  const sofa = await fakeModel({
    source: '/static/furniture/sofa.glb',
    name: 'Sofa',
    catalogId: 'kenney-sofa',
    baseSize: { x: 2, y: 0.8, z: 0.9 },
  })
  sofa.object3d.position.set(1, 0, -0.5) // editor coords
  sofa.object3d.rotation.set(0, Math.PI / 2, 0)
  const cube = createPrimitiveObject('cube')
  cube.object3d.position.set(-1, 0, 0)
  const lamp = createLight()
  lamp.object3d.position.set(0, 2.5, 0)

  let objects = [...loaded.objects, sofa, cube, lamp]
  objects = updateObjectColor(objects, cube.id, '#ff0000')

  const { scene: saved, skipped } = objectsToSceneV1(plan, objects, offset)
  assert.deepEqual(skipped, [])
  assert.deepEqual(saved.walls, plan.walls, 'walls saved unchanged')
  assert.deepEqual(saved.rooms, plan.rooms, 'rooms saved unchanged')

  const [sofaAsset, cubeAsset] = saved.assets!
  assert.equal(sofaAsset.kind, 'model')
  assert.equal(sofaAsset.catalogId, 'kenney-sofa')
  assert.deepEqual(sofaAsset.baseSize, { x: 2, y: 0.8, z: 0.9 })
  assert.deepEqual(
    sofaAsset.transform.position,
    { x: 13, y: 0, z: 5.5 },
    'absolute plan coordinates',
  )
  assert.equal(cubeAsset.kind, 'primitive')
  assert.equal(cubeAsset.source, 'cube')
  const cubeMat = saved.materials!.find((m) => m.id === cubeAsset.materialId)
  assert.equal(cubeMat?.color, '#ff0000')
  assert.deepEqual(
    saved.lighting!.lights!.map((l) => l.type),
    ['directional', 'point'],
    'converter light kept, editor light added',
  )

  // Reload and save again: identical.
  const reloaded = await sceneV1ToObjects(saved, offset, deps)
  assert.deepEqual(reloaded.failed, [])
  const again = objectsToSceneV1(saved, reloaded.objects, offset).scene
  assert.deepEqual(again, saved)

  // The reloaded sofa really is 2 m wide (rotated 90°, so along z).
  const sofaObj = reloaded.objects.find((o) => o.name === 'Sofa')!
  const size = new THREE.Box3().setFromObject(sofaObj.object3d).getSize(new THREE.Vector3())
  assert.ok(Math.abs(size.z - 2) < 1e-6 && Math.abs(size.y - 0.8) < 1e-6)
})

test('a model that fails to load is reported, the rest still opens', async () => {
  const withAsset: SceneV1 = {
    ...plan,
    assets: [
      {
        id: 'x',
        name: 'Broken chair',
        kind: 'model',
        source: '/missing.glb',
        transform: {
          position: { x: 12, y: 0, z: 6 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        },
      },
    ],
  }
  const failing: LoadDeps = { ...deps, createModel: async () => Promise.reject(new Error('404')) }
  const res = await sceneV1ToObjects(withAsset, planOffset(withAsset), failing)
  assert.deepEqual(res.failed, ['Broken chair'])
  assert.equal(res.objects.length, 5)
})

test("walls and floors are tagged and can't be deleted", () => {
  const objs = buildSceneObjectsFromSceneV1(plan)
  assert.equal(getMeta(objs[0].object3d)?.kind, 'wall')
  assert.equal(getMeta(objs[4].object3d)?.kind, 'floor')
  assert.equal(objs[4].name, 'Floor: Kitchen')
  assert.equal(deleteObject(objs, objs[0].id).length, objs.length)
})
