import type {
  CanvasV2,
  SceneV1,
  SceneWall,
  SceneRoom,
  SceneOpening,
  SceneMaterial,
  SceneLighting,
} from './types'
import { DEFAULT_WALL_MATERIAL_ID } from './defaults'
import { detectRooms } from './detectRooms'

// Deterministic canvas-v2 -> scene-v1 conversion. Same input always produces an
// identical scene (no time, no randomness, stable ordering). This is the heart of
// Path A: structured 2D -> canonical 3D.
//
// Coordinate mapping: canvas pixels (x, y) with +y downward map to the floor
// plane (x, z) in metres by dividing by pixelsPerMetre. Vertical dimensions are
// already in metres in canvas-v2. Wall extrusion height is the project wallHeight.
export function convertToScene(canvas: CanvasV2): SceneV1 {
  const ppm = canvas.scale.pixelsPerMetre
  const toM = (px: number): number => px / ppm

  // Group openings by wall so each wall carries its own cutouts. Unknown wallIds
  // are skipped defensively (validation upstream should already reject them).
  const wallIds = new Set(canvas.walls.map((w) => w.id))
  const openingsByWall = new Map<string, SceneOpening[]>()
  for (const op of canvas.openings ?? []) {
    if (!wallIds.has(op.wallId)) continue
    const sceneOpening: SceneOpening = {
      id: op.id,
      type: op.type,
      center: op.offset,
      width: toM(op.width),
      height: op.height,
      sillHeight: op.sillHeight ?? 0,
    }
    const list = openingsByWall.get(op.wallId)
    if (list) list.push(sceneOpening)
    else openingsByWall.set(op.wallId, [sceneOpening])
  }

  const walls: SceneWall[] = canvas.walls.map((w) => {
    const wall: SceneWall = {
      id: w.id,
      start: { x: toM(w.start.x), z: toM(w.start.y) },
      end: { x: toM(w.end.x), z: toM(w.end.y) },
      thickness: toM(w.thickness),
      height: canvas.wallHeight,
      materialId: DEFAULT_WALL_MATERIAL_ID,
    }
    if (w.curvature) wall.curvature = toM(w.curvature)
    const openings = openingsByWall.get(w.id)
    if (openings) wall.openings = openings
    return wall
  })

  // Enclosed wall loops → room floor polygons (empty if the plan isn't closed).
  const rooms: SceneRoom[] = detectRooms(walls).map((r, i) => ({
    id: `room-${i}`,
    floorPolygon: r.floorPolygon,
    area: r.area,
  }))

  return {
    version: 'scene-v1',
    units: 'metre',
    walls,
    rooms,
    // Assets/lighting/materials are enriched by the 3D editor. The converter only
    // emits structure plus enough defaults for the scene to render.
    assets: [],
    lighting: DEFAULT_LIGHTING,
    materials: DEFAULT_MATERIALS,
  }
}

const DEFAULT_LIGHTING: SceneLighting = {
  ambient: { color: '#ffffff', intensity: 0.6 },
  lights: [
    {
      id: 'sun',
      type: 'directional',
      color: '#ffffff',
      intensity: 1,
      position: { x: 5, y: 10, z: 5 },
      target: { x: 0, y: 0, z: 0 },
    },
  ],
}

const DEFAULT_MATERIALS: SceneMaterial[] = [
  {
    id: DEFAULT_WALL_MATERIAL_ID,
    name: 'Wall',
    color: '#e8e8e8',
    roughness: 0.9,
    metalness: 0,
  },
]
