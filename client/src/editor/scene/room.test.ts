import * as THREE from 'three'
import { describe, expect, test } from 'vitest'
import { clampToGrid, defaultSpot, fitGrid, keepInRoom, roomFromNavigation } from './room'

const room = { width: 10, length: 8, height: 2.8 }

// A 1 m cube whose origin is its base (like furniture), or its centre.
function cube(origin: 'base' | 'centre') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1))
  if (origin === 'centre') return mesh
  const group = new THREE.Group()
  mesh.position.y = 0.5
  group.add(mesh)
  return group
}

describe('keepInRoom', () => {
  test('an object standing on the floor stays on the floor (not lifted by half its height)', () => {
    const sofa = cube('base')
    sofa.position.set(1, 0, 1)
    keepInRoom(sofa, room)
    expect(sofa.position.toArray()).toEqual([1, 0, 1])
  })

  test('pulls an object back inside each wall, the floor and the ceiling', () => {
    const sofa = cube('base')
    sofa.position.set(7, -1, -9)
    keepInRoom(sofa, room)
    expect(sofa.position.toArray()).toEqual([4.5, 0, -3.5])

    const lamp = cube('base')
    lamp.position.set(0, 2.5, 0)
    keepInRoom(lamp, room)
    expect(lamp.position.y).toBeCloseTo(1.8)
  })

  test('works for centred objects too, and ignores empty ones', () => {
    const box = cube('centre')
    box.position.set(0, 0, 0)
    keepInRoom(box, room)
    expect(box.position.y).toBe(0.5)
    const empty = new THREE.Group()
    empty.position.set(50, 50, 50)
    keepInRoom(empty, room)
    expect(empty.position.x).toBe(50)
  })

  test('an object bigger than the room is aligned to the low side', () => {
    const big = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 1))
    big.position.set(3, 0.5, 0)
    keepInRoom(big, room)
    expect(big.position.x).toBe(-5 + 6)
  })
})

test('grid size: plan + 2 m, rounded up, at least 4 m', () => {
  expect(fitGrid(8.6)).toBe(11)
  expect(fitGrid(0.5)).toBe(4)
})

test('a new project’s room comes from the dashboard, else the default', () => {
  expect(roomFromNavigation({ gridWidth: 6, gridLength: 7, height: 3 })).toEqual({
    width: 6,
    length: 7,
    height: 3,
  })
  expect(roomFromNavigation({ width: 5, length: 4 })).toMatchObject({ width: 5, length: 4 })
  expect(roomFromNavigation(null)).toEqual({ width: 10, length: 10, height: 1 })
})

test('new objects fill a grid near the middle; drops stay on the grid', () => {
  expect(defaultSpot(0, room)).toEqual({ x: -1.2, z: -1.2 })
  expect(defaultSpot(5, room)).toEqual({ x: expect.closeTo(-0.4), z: expect.closeTo(-0.4) })
  expect(defaultSpot(0, { width: 2, length: 2, height: 3 })).toEqual({ x: -0.5, z: -0.5 })
  expect(clampToGrid({ x: 20, z: -20 }, room)).toEqual({ x: 5, z: -4 })
})
