import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  activeSceneResponse,
  assetsResponse,
  parseResponse,
  suggestionsResponse,
  UnexpectedResponseError,
} from './apiSchemas'

const sofa = {
  id: 'kenney-lounge-sofa',
  name: 'Sofa',
  category: 'living',
  fileUrl: '/static/furniture/models/loungeSofa.glb',
  thumbnailUrl: null,
  dimensions: { x: 2, y: 0.8, z: 0.9 },
  roomTypes: ['living'],
  tags: [],
  placement: 'floor',
}

test('a well-formed furniture list passes through', () => {
  const { assets } = parseResponse(assetsResponse, { assets: [sofa] }, 'furniture list')
  assert.equal(assets[0].name, 'Sofa')
})

test('a malformed response throws a readable error', () => {
  assert.throws(
    () => parseResponse(assetsResponse, '<html>Bad gateway</html>', 'furniture list'),
    (e: unknown) =>
      e instanceof UnexpectedResponseError &&
      e.message === 'The server sent an unexpected furniture list. Try reloading the page.',
  )
  const noPlacement = { assets: [{ ...sofa, placement: 'roof' }] }
  assert.throws(() => parseResponse(assetsResponse, noPlacement, 'furniture list'))
})

test('suggestions need a placement for every item', () => {
  const suggestion = {
    item: sofa,
    score: 1,
    role: 'sofa',
    reason: 'A living room usually has a sofa.',
    placement: { position: { x: 1, y: 0, z: 2 }, rotationY: 0 },
    alternatives: [],
  }
  const room = { roomId: 'r1', type: 'living', area: 20, suggestions: [suggestion] }
  const ok = parseResponse(suggestionsResponse, { recommender: 'rules-v1', rooms: [room] }, 'x')
  assert.equal(ok.rooms[0].suggestions[0].placement.position.z, 2)

  const { placement: _, ...unplaced } = suggestion
  const bad = { recommender: 'rules-v1', rooms: [{ ...room, suggestions: [unplaced] }] }
  assert.throws(() => parseResponse(suggestionsResponse, bad, 'x'))
})

test('a saved scene may have no metadata, or a partial grid', () => {
  const bare = parseResponse(activeSceneResponse, { scene: { version: 3, sceneData: {} } }, 'x')
  assert.equal(bare.scene.metadata, undefined)
  const withGrid = parseResponse(
    activeSceneResponse,
    { scene: { version: 1, sceneData: {}, metadata: { grid: { width: 12 } } } },
    'x',
  )
  assert.equal(withGrid.scene.metadata?.grid?.width, 12)
  assert.throws(() =>
    parseResponse(activeSceneResponse, { scene: { version: '1', sceneData: {} } }, 'x'),
  )
})
