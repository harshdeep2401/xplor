import type * as THREE from 'three'

// What an editor object stands for in the saved scene-v1, kept on
// object3d.userData.xplor (userData survives Object3D.clone, so undo snapshots
// and copy/paste keep it). Lights keep their own userData.isLight flags.

export interface Size3 {
  x: number
  y: number
  z: number
}

// Walls and floors come from the 2D plan; they are rebuilt from the saved scene
// rather than saved as objects, and can't be moved or deleted in 3D.
export interface StructureMeta {
  kind: 'wall' | 'floor'
  // scene-v1 wall/room id.
  refId: string
}

// Something the user placed: a GLB model or a built-in shape.
export interface PlacedMeta {
  kind: 'model' | 'primitive'
  // GLB URL for a model, "cube" / "sphere" for a primitive.
  source: string
  catalogId?: string
  // Size (metres) the model was fitted to; the object's scale is applied on top.
  baseSize?: Size3
  // Colour / texture the user applied, if any ("#rrggbb", URL).
  color?: string
  textureUrl?: string
  // scene-v1 asset id, kept so ids are stable across saves.
  assetId?: string
}

export type ObjectMeta = StructureMeta | PlacedMeta

export function getMeta(obj: THREE.Object3D): ObjectMeta | undefined {
  return obj.userData?.xplor as ObjectMeta | undefined
}

export function setMeta(obj: THREE.Object3D, meta: ObjectMeta): void {
  obj.userData = { ...obj.userData, xplor: meta }
}

// Merge fields into a placed object's metadata (no-op for walls/floors/lights).
export function patchPlacedMeta(obj: THREE.Object3D, patch: Partial<PlacedMeta>): void {
  const meta = getMeta(obj)
  if (!meta || (meta.kind !== 'model' && meta.kind !== 'primitive')) return
  setMeta(obj, { ...meta, ...patch })
}

// Walls and floors belong to the 2D plan: no moving, resizing or deleting in 3D.
export function isLocked(obj: THREE.Object3D): boolean {
  const kind = getMeta(obj)?.kind
  return kind === 'wall' || kind === 'floor'
}

export function isFloor(obj: THREE.Object3D): boolean {
  return getMeta(obj)?.kind === 'floor'
}
