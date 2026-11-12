// The 3D editor's room: the grid-sized box (metres, centred on the origin, floor
// at y = 0) that objects live in, and how objects are kept inside it.
import * as THREE from 'three'

export interface RoomSize {
  // Along x, along z, and up (y), in metres.
  width: number
  length: number
  height: number
}

// Height matches the default wall height (DEFAULT_WALL_HEIGHT_M in
// editor/canvas/canvasV2.ts and the server's Project.defaultWallHeightM).
export const DEFAULT_ROOM: RoomSize = { width: 10, length: 10, height: 1.0 }

// Grid-fit tuning: metres of breathing room around the plan, and the smallest
// grid we'll ever show so tiny plans still have a usable floor.
const GRID_MARGIN_M = 2
const MIN_GRID_M = 4

// Grid size (metres) for a plan of the given extent: extent + margin, floored
// at a minimum, rounded up to a whole metre for a tidy grid.
export function fitGrid(extentM: number): number {
  return Math.max(MIN_GRID_M, Math.ceil(extentM + GRID_MARGIN_M))
}

// The room a new 3D project starts with: the size chosen on the dashboard (sent
// as navigation state), else the default.
export function roomFromNavigation(state: unknown): RoomSize {
  const s = (state ?? {}) as {
    gridWidth?: number
    width?: number
    gridLength?: number
    length?: number
    height?: number
  }
  return {
    width: Number(s.gridWidth ?? s.width ?? DEFAULT_ROOM.width),
    length: Number(s.gridLength ?? s.length ?? DEFAULT_ROOM.length),
    height: Number(s.height ?? DEFAULT_ROOM.height),
  }
}

// Move `obj` the least distance that puts its whole bounding box inside the
// room (on the floor, under the ceiling, within the grid). Works from the
// actual box, so it's right for objects whose origin is their base (furniture)
// as well as their centre. Too big to fit: aligned to the low side.
export function keepInRoom(obj: THREE.Object3D, room: RoomSize): void {
  obj.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty()) return
  const shift = (min: number, max: number, lo: number, hi: number) =>
    min < lo ? lo - min : max > hi ? Math.max(hi - max, lo - min) : 0
  obj.position.x += shift(box.min.x, box.max.x, -room.width / 2, room.width / 2)
  obj.position.y += shift(box.min.y, box.max.y, 0, room.height)
  obj.position.z += shift(box.min.z, box.max.z, -room.length / 2, room.length / 2)
  obj.updateMatrixWorld(true)
}

// Where a new object goes when it isn't dropped anywhere: the n-th free spot on
// a 4-wide grid near the middle, so repeated adds don't stack, kept 0.5 m in
// from the edges.
export function defaultSpot(n: number, room: RoomSize): { x: number; z: number } {
  return {
    x: THREE.MathUtils.clamp((n % 4) * 0.8 - 1.2, -room.width / 2 + 0.5, room.width / 2 - 0.5),
    z: THREE.MathUtils.clamp(
      Math.floor(n / 4) * 0.8 - 1.2,
      -room.length / 2 + 0.5,
      room.length / 2 - 0.5,
    ),
  }
}

// A dropped object's spot, kept on the grid.
export function clampToGrid(at: { x: number; z: number }, room: RoomSize) {
  return {
    x: THREE.MathUtils.clamp(at.x, -room.width / 2, room.width / 2),
    z: THREE.MathUtils.clamp(at.z, -room.length / 2, room.length / 2),
  }
}
