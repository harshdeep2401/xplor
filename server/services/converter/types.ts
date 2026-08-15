// TypeScript mirrors of the JSON Schema contracts in /contracts. The schemas are
// the source of truth (validated at runtime via validate.ts); these types just
// give the converter code static safety. Keep them in sync with the .schema.json.

// ---------------------------------------------------------------------------
// canvas-v1 — the BESPOKE legacy shape the 2D editor still persists today, stored
// as project.canvas = { elements: [...] }. Not a contract; see contracts/README.md.
// ---------------------------------------------------------------------------
export interface CanvasV1Wall {
  id: string
  type: 'wall'
  startX: number
  startY: number
  endX: number
  endY: number
  thickness: number
  curvature?: number
}
export interface CanvasV1Door {
  id: string
  type: 'door'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}
export interface CanvasV1Window {
  id: string
  type: 'window'
  x: number
  y: number
  startX: number
  startY: number
  width: number
  height: number
  rotation: number
  curvature: number
  attachedWallId: string | null
}
export interface CanvasV1Label {
  id: string
  type: 'label'
  x: number
  y: number
  text: string
  fontSize: number
}
export type CanvasV1Element =
  | CanvasV1Wall
  | CanvasV1Door
  | CanvasV1Window
  | CanvasV1Label
export interface CanvasV1 {
  elements?: CanvasV1Element[]
}

// ---------------------------------------------------------------------------
// canvas-v2 — contracts/canvas-v2.schema.json (pixels + scale; parametric openings)
// ---------------------------------------------------------------------------
export interface Point {
  x: number
  y: number
}
export interface CanvasV2Wall {
  id: string
  start: Point
  end: Point
  thickness: number
  curvature?: number
}
export interface CanvasV2Opening {
  id: string
  type: 'door' | 'window'
  wallId: string
  offset: number
  width: number
  height: number
  sillHeight?: number
}
export interface CanvasV2Label {
  id: string
  position: Point
  text: string
  fontSize?: number
}
export interface CanvasV2 {
  version: 'canvas-v2'
  scale: { pixelsPerMetre: number }
  wallHeight: number
  walls: CanvasV2Wall[]
  openings?: CanvasV2Opening[]
  labels?: CanvasV2Label[]
}

// ---------------------------------------------------------------------------
// scene-v1 — contracts/scene-v1.schema.json (metres, Y-up, floor at y=0)
// ---------------------------------------------------------------------------
export interface Vec2 {
  x: number
  z: number
}
export interface Vec3 {
  x: number
  y: number
  z: number
}
export interface SceneOpening {
  id: string
  type: 'door' | 'window'
  center: number
  width: number
  height: number
  sillHeight?: number
}
export interface SceneWall {
  id: string
  start: Vec2
  end: Vec2
  thickness: number
  height: number
  curvature?: number
  openings?: SceneOpening[]
  materialId?: string
}
export interface SceneRoom {
  id: string
  name?: string
  floorPolygon: Vec2[]
  area?: number
  materialId?: string
}
export interface SceneTransform {
  position: Vec3
  rotation: Vec3
  scale: Vec3
}
export interface SceneAsset {
  id: string
  name?: string
  source?: string
  transform: SceneTransform
  materialId?: string
}
export interface SceneLight {
  id: string
  type: 'directional' | 'point' | 'spot'
  color: string
  intensity: number
  position?: Vec3
  target?: Vec3
}
export interface SceneLighting {
  ambient?: { color: string; intensity: number }
  lights?: SceneLight[]
}
export interface SceneMaterial {
  id: string
  name?: string
  color?: string
  roughness?: number
  metalness?: number
  textureUrl?: string
}
export interface SceneV1 {
  version: 'scene-v1'
  units: 'metre'
  walls: SceneWall[]
  rooms?: SceneRoom[]
  assets?: SceneAsset[]
  lighting?: SceneLighting
  materials?: SceneMaterial[]
}
