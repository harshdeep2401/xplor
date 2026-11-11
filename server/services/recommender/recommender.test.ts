import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { convertCanvasToScene } from '../converter'
import type { CanvasV2, SceneAsset, SceneV1, Vec2 } from '../converter/types'
import { pointInPolygon } from '../converter/roomSemantics'
import { ruleBasedRecommender } from './ruleBased'
import { type Box, collides, frontOf, insideRoom, rightOf, roomEdges } from './geometry'
import type { CatalogItem, RoomSuggestions, Suggestion } from './types'

// The real seeded catalog, as the API would serve it.
const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'furniture-catalog.json'), 'utf8'),
) as {
  source: string
  items: {
    slug: string
    name: string
    category: string
    model: string
    dimensions: CatalogItem['dimensions']
    roomTypes: string[]
    tags: string[]
    placement: CatalogItem['placement']
  }[]
}
const catalog: CatalogItem[] = raw.items.map((i) => ({
  id: `${raw.source}-${i.slug}`,
  name: i.name,
  category: i.category,
  fileUrl: `/static/furniture/models/${i.model}`,
  thumbnailUrl: null,
  dimensions: i.dimensions,
  roomTypes: i.roomTypes,
  tags: i.tags,
  placement: i.placement,
}))
const byId = new Map(catalog.map((c) => [c.id, c]))

// A single rectangular room w × d metres (100 px/m), labelled, optionally with a
// 0.9 m door in the middle of its bottom wall.
function room(w: number, d: number, label: string, door = false): SceneV1 {
  const W = w * 100
  const D = d * 100
  const canvas: CanvasV2 = {
    version: 'canvas-v2',
    scale: { pixelsPerMetre: 100 },
    wallHeight: 2.8,
    walls: [
      { id: 'n', start: { x: 0, y: 0 }, end: { x: W, y: 0 }, thickness: 10 },
      { id: 'e', start: { x: W, y: 0 }, end: { x: W, y: D }, thickness: 10 },
      { id: 's', start: { x: W, y: D }, end: { x: 0, y: D }, thickness: 10 },
      { id: 'w', start: { x: 0, y: D }, end: { x: 0, y: 0 }, thickness: 10 },
    ],
    openings: door
      ? [{ id: 'door', type: 'door', wallId: 's', offset: 0.5, width: 90, height: 2.1 }]
      : [],
    labels: [{ id: 'l', position: { x: W / 2, y: D / 2 }, text: label }],
  }
  return convertCanvasToScene(canvas)
}

const only = (rooms: RoomSuggestions[]) => {
  assert.equal(rooms.length, 1)
  return rooms[0]
}
const boxOf = (s: Suggestion): Box => ({
  centre: { x: s.placement.position.x, z: s.placement.position.z },
  angle: s.placement.rotationY,
  hw: s.item.dimensions!.x / 2,
  hd: s.item.dimensions!.z / 2,
  y0: s.placement.position.y,
  y1: s.placement.position.y + s.item.dimensions!.y,
})
const flat = (b: Box) => b.y1 - b.y0 < 0.05
const byRole = (r: RoomSuggestions, role: string) => r.suggestions.find((s) => s.role === role)

function asset(id: string, catalogId: string, x: number, z: number, rotY = 0, y = 0): SceneAsset {
  const item = byId.get(catalogId)!
  return {
    id,
    kind: 'model',
    source: item.fileUrl,
    catalogId,
    baseSize: item.dimensions!,
    transform: {
      position: { x, y, z },
      rotation: { x: 0, y: rotY, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    },
  }
}

// Every suggestion sits inside its room and no two non-flat ones collide.
function assertConsistent(scene: SceneV1, r: RoomSuggestions) {
  const poly = scene.rooms!.find((x) => x.id === r.roomId)!.floorPolygon
  const boxes = r.suggestions.map(boxOf)
  boxes.forEach((b, i) => {
    assert.ok(insideRoom(b, poly, 0.05), `${r.suggestions[i].item.name} inside the room`)
    boxes.forEach((o, j) => {
      if (j <= i || flat(b) !== flat(o)) return
      assert.ok(
        !collides(b, o, 0.0),
        `${r.suggestions[i].item.name} vs ${r.suggestions[j].item.name}`,
      )
    })
  })
}

test('geometry: inward normals and concave rooms', () => {
  const ell: Vec2[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 2 },
    { x: 2, z: 2 },
    { x: 2, z: 4 },
    { x: 0, z: 4 },
  ]
  for (const e of roomEdges(ell)) {
    const mid = {
      x: (e.start.x + e.end.x) / 2 + e.inward.x * 0.1,
      z: (e.start.z + e.end.z) / 2 + e.inward.z * 0.1,
    }
    assert.ok(pointInPolygon(mid, ell), 'normal points inside')
  }
  const inNotch: Box = { centre: { x: 3, z: 3 }, angle: 0, hw: 0.3, hd: 0.3, y0: 0, y1: 1 }
  const acrossNotch: Box = { centre: { x: 2, z: 2 }, angle: 0, hw: 0.5, hd: 0.5, y0: 0, y1: 1 }
  const inLeg: Box = { centre: { x: 1, z: 3 }, angle: 0, hw: 0.5, hd: 0.5, y0: 0, y1: 1 }
  assert.equal(insideRoom(inNotch, ell, 0.05), false)
  assert.equal(insideRoom(acrossNotch, ell, 0.05), false)
  assert.equal(insideRoom(inLeg, ell, 0.05), true)
})

test('an empty bedroom gets a bed against a wall, then pieces around it', () => {
  const scene = room(3.6, 4, 'Bedroom')
  const r = only(ruleBasedRecommender.recommend({ scene, catalog }))
  assert.equal(r.type, 'bedroom')
  assert.equal(r.suggestions[0].role, 'bed')
  assert.equal(r.suggestions[0].item.id, 'kenney-bedDouble', '14.4 m² → double bed')
  assert.ok(byRole(r, 'nightstand'), 'nightstand next to the suggested bed')
  assert.match(byRole(r, 'nightstand')!.reason, /suggested bed/)
  assert.ok(byRole(r, 'wardrobe'))
  assertConsistent(scene, r)

  // The bed's back is against a wall: its back edge is ~wall margin from the wall line.
  const bed = boxOf(r.suggestions[0])
  const back = {
    x: bed.centre.x - frontOf(bed.angle).x * bed.hd,
    z: bed.centre.z - frontOf(bed.angle).z * bed.hd,
  }
  const toWall = Math.min(back.x, 3.6 - back.x, back.z, 4 - back.z)
  assert.ok(toWall < 0.1, `bed back ${toWall.toFixed(3)} m from the wall`)
})

test('with a bed already there, it suggests what goes with it (with a bonus)', () => {
  const scene = room(3.6, 4, 'Bedroom')
  // Double bed against the north wall, head at z≈0, facing +z (south).
  scene.assets = [asset('bed', 'kenney-bedDouble', 1.8, 0.08 + 1.05)]
  const r = only(ruleBasedRecommender.recommend({ scene, catalog }))
  assert.equal(byRole(r, 'bed'), undefined, 'no second bed')
  const ns = byRole(r, 'nightstand')!
  assert.equal(ns.reason, 'Goes with the bed.')
  assert.equal(ns.score, 0.7 + 0.15)
  // Beside the bed's head: same depth line as the bed's back, just past its side.
  assert.ok(ns.placement.position.z < 0.5, 'at the head end')
  assert.ok(Math.abs(Math.abs(ns.placement.position.x - 1.8) - (0.825 + 0.25 + 0.06)) < 1e-3)
  assertConsistent(scene, r)
})

test('living room: coffee table in front of the sofa, TV stand facing it, TV on the stand', () => {
  const scene = room(5, 4, 'Living room')
  const r = only(ruleBasedRecommender.recommend({ scene, catalog, limit: 20 }))
  const sofa = boxOf(byRole(r, 'sofa')!)
  const table = boxOf(byRole(r, 'coffeeTable')!)
  const stand = boxOf(byRole(r, 'tvStand')!)
  const tv = byRole(r, 'tv')!
  // Coffee table: in front of the sofa (along its facing), 0.4 m gap.
  const f = frontOf(sofa.angle)
  const ahead = (table.centre.x - sofa.centre.x) * f.x + (table.centre.z - sofa.centre.z) * f.z
  assert.ok(Math.abs(ahead - (sofa.hd + 0.4 + table.hd)) < 1e-3)
  // TV stand faces the sofa: their fronts point at each other.
  const fs = frontOf(stand.angle)
  assert.ok(f.x * fs.x + f.z * fs.z < -0.99, 'opposite walls, facing each other')
  // TV stands on the stand.
  assert.ok(Math.abs(tv.placement.position.y - stand.y1) < 1e-3)
  assert.equal(tv.reason, 'For the suggested TV stand.')
  assertConsistent(scene, r)
})

test('doorways stay clear, the doormat goes at the door', () => {
  const scene = room(2.2, 3.5, 'Hall', true)
  const r = only(ruleBasedRecommender.recommend({ scene, catalog, limit: 20 }))
  assert.equal(r.type, 'hallway')
  const door: Box = { centre: { x: 1.1, z: 3.5 }, angle: 0, hw: 0.5, hd: 0.9, y0: 0, y1: 2.1 }
  for (const s of r.suggestions) {
    const b = boxOf(s)
    if (!flat(b)) assert.ok(!collides(b, door, 0), `${s.item.name} blocks the door`)
  }
  const mat = byRole(r, 'doormat')!
  assert.ok(
    Math.abs(mat.placement.position.x - 1.1) < 1e-6 && mat.placement.position.z > 3,
    'mat inside the door',
  )
})

test('small bathroom: shower not bath; mirror above the basin', () => {
  const scene = room(2, 2.2, 'Bathroom')
  const r = only(ruleBasedRecommender.recommend({ scene, catalog, limit: 20 }))
  assert.ok(byRole(r, 'shower'))
  assert.equal(byRole(r, 'bathtub'), undefined)
  const basin = boxOf(byRole(r, 'basin')!)
  const mirror = byRole(r, 'mirror')!
  assert.ok(Math.abs(mirror.placement.position.y - (basin.y1 + 0.25)) < 1e-3)
  assertConsistent(scene, r)
})

test('kitchen: hood above the stove, wall cabinets at 1.45 m', () => {
  const scene = room(3, 3.5, 'Kitchen')
  const r = only(ruleBasedRecommender.recommend({ scene, catalog, limit: 20 }))
  const stove = boxOf(byRole(r, 'stove')!)
  const hood = byRole(r, 'hood')!
  assert.ok(Math.abs(hood.placement.position.y - (stove.y1 + 0.65)) < 1e-3)
  // Same spot along the wall (no sideways offset from the stove), back to the wall like it.
  const side = rightOf(stove.angle)
  const dx = hood.placement.position.x - stove.centre.x
  const dz = hood.placement.position.z - stove.centre.z
  assert.ok(Math.abs(dx * side.x + dz * side.z) < 1e-3)
  assert.equal(hood.placement.rotationY, stove.angle)
  const wc = byRole(r, 'wallCabinet')
  if (wc) assert.equal(wc.placement.position.y, 1.45)
  assertConsistent(scene, r)
})

test('suggestions avoid furniture already in the room and are deterministic', () => {
  const scene = room(4, 4, 'Living')
  scene.assets = [asset('sofa', 'kenney-loungeSofa', 2, 0.08 + 0.44)]
  const a = ruleBasedRecommender.recommend({ scene, catalog })
  const b = ruleBasedRecommender.recommend({ scene, catalog })
  assert.deepEqual(a, b)
  const sofa: Box = { centre: { x: 2, z: 0.52 }, angle: 0, hw: 1, hd: 0.44, y0: 0, y1: 0.85 }
  for (const s of a[0].suggestions) {
    const box = boxOf(s)
    if (!flat(box)) assert.ok(!collides(box, sofa, 0), `${s.item.name} hits the sofa`)
  }
  assert.equal(byRole(a[0], 'sofa'), undefined)
})

test('roomId filters; a room too small for a role is skipped, not forced', () => {
  const scene = room(1.2, 1.2, 'Bedroom')
  const r = only(ruleBasedRecommender.recommend({ scene, catalog, roomId: 'room-0' }))
  assert.equal(byRole(r, 'bed'), undefined, 'no bed fits in 1.2 m')
  assert.deepEqual(ruleBasedRecommender.recommend({ scene, catalog, roomId: 'nope' }), [])
})
