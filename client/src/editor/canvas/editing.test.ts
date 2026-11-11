import { test } from 'node:test'
import assert from 'node:assert/strict'
import { duplicateElements, formatMetres, translateElements } from './editing'
import type { EditorElement } from './elements'

const wall: EditorElement = {
  id: 'w1',
  type: 'wall',
  startX: 0,
  startY: 0,
  endX: 100,
  endY: 0,
  thickness: 30,
}
const win: EditorElement = {
  id: 'n1',
  type: 'window',
  x: 50,
  y: 0,
  startX: 40,
  startY: 0,
  width: 20,
  height: 30,
  rotation: 0,
  curvature: 0,
  attachedWallId: 'w1',
}
const label: EditorElement = {
  id: 'l1',
  type: 'label',
  x: 10,
  y: 10,
  text: 'Kitchen',
  fontSize: 24,
}

test('translate moves only the selected elements, every point of them', () => {
  const out = translateElements([wall, win, label], new Set(['w1', 'n1']), 5, -2)
  assert.deepEqual(out[0], { ...wall, startX: 5, startY: -2, endX: 105, endY: -2 })
  assert.deepEqual(out[1], { ...win, x: 55, y: -2, startX: 45, startY: -2 })
  assert.equal(out[2], label) // untouched, same object
})

test('duplicate gives new ids, offsets the copies and keeps the originals intact', () => {
  let n = 0
  const copies = duplicateElements([wall, label], 20, () => String(++n))
  assert.deepEqual(
    copies.map((c) => c.id),
    ['wall_1', 'label_2'],
  )
  assert.deepEqual(copies[0], {
    ...wall,
    id: 'wall_1',
    startX: 20,
    startY: 20,
    endX: 120,
    endY: 20,
  })
  assert.equal(wall.startX, 0)
})

test('a window copied with its wall attaches to the copied wall', () => {
  let n = 0
  const [newWall, newWin] = duplicateElements([wall, win], 20, () => String(++n))
  assert.equal(newWin.type === 'window' && newWin.attachedWallId, newWall.id)
})

test('a window copied alone stays attached to its original wall', () => {
  const [newWin] = duplicateElements([win], 20, () => 'x')
  assert.equal(newWin.type === 'window' && newWin.attachedWallId, 'w1')
})

test('metres use the project scale', () => {
  assert.equal(formatMetres(325, 100), '3.25 m')
  assert.equal(formatMetres(50, 25), '2.00 m')
})
