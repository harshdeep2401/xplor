import { describe, expect, test } from 'vitest'
import type { EditorElement, WallElement, WindowElement } from './elements'
import { snapToWallEdge, snapToWallPoints, windowCurvatureOn } from './snapping'
import {
  elementsInBox,
  placeDoor,
  placeLabel,
  startWall,
  startWindow,
  stretchWindow,
  wallEnd,
} from './drawing'

const wall = (
  id: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  curvature = 0,
) => ({ id, type: 'wall', startX, startY, endX, endY, thickness: 30, curvature }) as WallElement

// A 400 px horizontal wall along y = 100.
const top = wall('top', 100, 100, 500, 100)

describe('snapToWallPoints', () => {
  test('pulls a nearby point onto a wall end or midpoint, the nearest one winning', () => {
    expect(snapToWallPoints(110, 95, [top])).toEqual({ x: 100, y: 100 })
    expect(snapToWallPoints(305, 108, [top])).toEqual({ x: 300, y: 100 })
    expect(snapToWallPoints(495, 100, [top])).toEqual({ x: 500, y: 100 })
  })

  test('leaves a point that is far from every wall alone', () => {
    expect(snapToWallPoints(200, 200, [top])).toEqual({ x: 200, y: 200 })
    expect(snapToWallPoints(130, 100, [top], 20)).toEqual({ x: 130, y: 100 })
  })
})

describe('snapToWallEdge', () => {
  test('projects onto the nearest wall and reports its angle', () => {
    expect(snapToWallEdge(250, 110, [top])).toEqual({ x: 250, y: 100, angle: 0, wall: top })
    const side = wall('side', 500, 100, 500, 400)
    expect(snapToWallEdge(490, 250, [top, side])).toMatchObject({
      x: 500,
      y: 250,
      angle: 90,
      wall: side,
    })
  })

  test('clamps to the wall’s ends and ignores zero-length walls and far points', () => {
    expect(snapToWallEdge(90, 100, [top])).toMatchObject({ x: 100, y: 100 })
    const dot = wall('dot', 300, 300, 300, 300)
    expect(snapToWallEdge(301, 301, [dot])).toEqual({ x: 301, y: 301, angle: null, wall: null })
    expect(snapToWallEdge(250, 200, [top])).toMatchObject({ angle: null, wall: null })
  })
})

describe('walls', () => {
  test('a new wall starts on a nearby wall end', () => {
    const w = startWall(503, 98, [top])
    expect(w).toMatchObject({
      type: 'wall',
      startX: 500,
      startY: 100,
      endX: 500,
      endY: 100,
      thickness: 30,
    })
  })

  test('the end straightens when nearly horizontal or vertical, or with Shift', () => {
    const w = wall('w', 0, 0, 0, 0)
    expect(wallEnd(w, 300, 20, [], false)).toEqual({ x: 300, y: 0 })
    expect(wallEnd(w, 20, 300, [], false)).toEqual({ x: 0, y: 300 })
    expect(wallEnd(w, 300, 200, [], false)).toEqual({ x: 300, y: 200 })
    expect(wallEnd(w, 300, 200, [], true)).toEqual({ x: 300, y: 0 })
  })

  test('the end snaps to other walls so rooms close', () => {
    const w = wall('w', 100, 400, 100, 400)
    expect(wallEnd(w, 104, 110, [top], false)).toEqual({ x: 100, y: 100 })
  })
})

describe('doors, windows and labels', () => {
  test('a door lands on the nearest wall, turned to match it', () => {
    expect(placeDoor(250, 112, [top])).toMatchObject({
      type: 'door',
      x: 250,
      y: 100,
      rotation: 0,
      width: 120,
    })
    expect(placeDoor(250, 300, [top])).toMatchObject({ x: 250, y: 300, rotation: 0 })
  })

  test('a window starts on a wall and stretches along it while dragging', () => {
    const win = startWindow(200, 105, [top])
    expect(win).toMatchObject({ x: 200, y: 100, startX: 200, width: 1, attachedWallId: 'top' })
    const stretched = stretchWindow(win, 320, 96, [top])
    expect(stretched).toMatchObject({ x: 260, y: 100, width: 120, rotation: 0, curvature: 0 })
    // On a straight wall the window doesn't keep its wall (only curved walls bend it).
    expect(stretched.attachedWallId).toBeNull()
    // Never narrower than 10 px.
    expect(stretchWindow(win, 202, 100, [top]).width).toBe(10)
  })

  test('on a curved wall the window bows with it', () => {
    const arc = wall('arc', 100, 100, 500, 100, 80)
    const win = startWindow(200, 100, [arc])
    expect(win.curvature).toBeCloseTo(80 / 400 ** 2)
    const stretched: WindowElement = stretchWindow(win, 400, 100, [arc])
    expect(stretched.attachedWallId).toBe('arc')
    expect(stretched.curvature).toBeCloseTo(windowCurvatureOn(arc, 200))
    expect(windowCurvatureOn(top, 200)).toBe(0)
  })

  test('a label is a named point', () => {
    expect(placeLabel(10, 20)).toMatchObject({
      type: 'label',
      x: 10,
      y: 20,
      text: 'Room Name',
      fontSize: 24,
    })
  })
})

test('a selection box takes walls with an end inside, and other elements by position', () => {
  const elements: EditorElement[] = [
    top,
    wall('far', 900, 900, 1000, 900),
    placeDoor(250, 100, [top]),
    placeLabel(700, 700),
  ]
  const ids = elementsInBox(elements, { startX: 600, startY: 600, endX: 50, endY: 50 })
  expect(ids).toEqual(['top', elements[2].id])
})
