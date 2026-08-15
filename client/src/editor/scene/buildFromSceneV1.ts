import * as THREE from 'three'
import type { SceneObject } from '../../types/scene'
import { computeWallPieces } from './wallPieces'

// Builds editor SceneObjects (Three.js meshes) from a canonical scene-v1 payload
// produced by the backend converter. For now each wall becomes a solid extruded
// box — enough to SEE the converted 2D plan in 3D. Door/window cutouts are not
// carved yet (deferred to the visual-polish pass); openings are ignored here.

// Minimal client mirror of the parts of scene-v1 we render.
interface SceneV1Vec2 {
  x: number
  z: number
}
interface SceneV1Opening {
  center: number
  width: number
  height: number
  sillHeight?: number
}
interface SceneV1Wall {
  id: string
  start: SceneV1Vec2
  end: SceneV1Vec2
  thickness: number
  height: number
  openings?: SceneV1Opening[]
}
interface SceneV1Material {
  id: string
  color?: string
}
interface SceneV1Room {
  id: string
  floorPolygon: SceneV1Vec2[]
}
interface SceneV1 {
  walls?: SceneV1Wall[]
  rooms?: SceneV1Room[]
  materials?: SceneV1Material[]
}

const FALLBACK_WALL_COLOR = '#e8e8e8'
const FLOOR_COLOR = '#cfcfcf'
// Lift floors a hair above y=0 so they don't z-fight with the ground grid.
const FLOOR_Y = 0.01

export function buildSceneObjectsFromSceneV1(scene: unknown): SceneObject[] {
  const s = (scene ?? {}) as SceneV1
  const walls = s.walls ?? []
  const wallColor = s.materials?.[0]?.color ?? FALLBACK_WALL_COLOR

  // Import rule: recentre the plan so its footprint sits over the world origin.
  // scene-v1 coordinates are absolute (canvas top-left → metres), so a plan drawn
  // anywhere but the canvas corner would otherwise load offset from the grid/camera.
  const centre = planCentre(walls)

  const wallObjects: SceneObject[] = walls.map((wall) => {
    const dx = wall.end.x - wall.start.x
    const dz = wall.end.z - wall.start.z
    const length = Math.hypot(dx, dz)

    // A wall is a Group whose local frame runs along its length (+X) from the wall
    // start, +Y up, +Z across its thickness. Positioned at the (recentred) start
    // and rotated to the wall's heading, so piece boxes can be placed in local
    // coordinates. One Group = one selectable wall in the editor.
    const group = new THREE.Group()
    group.position.set(wall.start.x - centre.x, 0, wall.start.z - centre.z)
    group.rotation.y = -Math.atan2(dz, dx)

    const material = new THREE.MeshStandardMaterial({ color: wallColor })
    const pieces = computeWallPieces({
      length,
      height: wall.height,
      openings: wall.openings,
    })
    for (const p of pieces) {
      const boxLen = p.uEnd - p.uStart
      const boxH = p.yTop - p.yBottom
      if (boxLen <= 0 || boxH <= 0) continue
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(boxLen, boxH, wall.thickness),
        material,
      )
      // Local: along-length midpoint, vertical midpoint, centred across thickness.
      mesh.position.set((p.uStart + p.uEnd) / 2, (p.yBottom + p.yTop) / 2, 0)
      group.add(mesh)
    }

    return { id: wall.id, name: `Wall ${wall.id}`, object3d: group }
  })

  // Room floors (from converter room-loop detection). Rendered as flat filled
  // polygons on the floor plane, recentred like the walls.
  const floorObjects: SceneObject[] = (s.rooms ?? [])
    .map((room) => buildFloor(room, centre))
    .filter((o): o is SceneObject => o !== null)

  return [...wallObjects, ...floorObjects]
}

function buildFloor(room: SceneV1Room, centre: { x: number; z: number }): SceneObject | null {
  const pts = room.floorPolygon
  if (!pts || pts.length < 3) return null

  // Build the outline in the shape's XY plane (x = world x, y = world z), recentred.
  const shape = new THREE.Shape()
  shape.moveTo(pts[0].x - centre.x, pts[0].z - centre.z)
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i].x - centre.x, pts[i].z - centre.z)
  }
  shape.closePath()

  const geometry = new THREE.ShapeGeometry(shape)
  const material = new THREE.MeshStandardMaterial({
    color: FLOOR_COLOR,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geometry, material)
  // Rotate the XY shape down onto the XZ floor plane: (x, y) → (x, 0, y).
  mesh.rotation.x = Math.PI / 2
  mesh.position.y = FLOOR_Y

  return { id: room.id, name: `Floor ${room.id}`, object3d: mesh }
}

interface WallBBox {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// XZ bounding box of all wall endpoints, or null for an empty plan.
function wallBBox(walls: SceneV1Wall[]): WallBBox | null {
  if (walls.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
  }
  return { minX, maxX, minZ, maxZ }
}

// XZ bounding-box centre of all wall endpoints (origin for an empty plan).
function planCentre(walls: SceneV1Wall[]): { x: number; z: number } {
  const b = wallBBox(walls)
  if (!b) return { x: 0, z: 0 }
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 }
}

// Real-world footprint of a converted plan (metres): X-extent (width), Z-extent
// (length), and the tallest wall (height). Null for a plan with no walls. Used to
// size the 3D editor's grid/room to the plan (Rule 3), instead of a fixed default.
export function planBoundsFromSceneV1(
  scene: unknown,
): { width: number; length: number; height: number } | null {
  const s = (scene ?? {}) as SceneV1
  const walls = s.walls ?? []
  const b = wallBBox(walls)
  if (!b) return null
  const height = walls.reduce((max, w) => Math.max(max, w.height), 0)
  return { width: b.maxX - b.minX, length: b.maxZ - b.minZ, height }
}
