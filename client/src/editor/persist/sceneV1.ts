import type * as THREE from 'three'
import type { SceneObject } from '../../types/scene'
import { createLight } from '../lights/createLight'
import { buildSceneObjectsFromSceneV1, planCentreFromSceneV1 } from '../scene/buildFromSceneV1'
import { createModelObject, createPrimitiveObject, type PrimitiveShape } from '../scene/models'
import { getMeta, patchPlacedMeta, type PlacedMeta, type Size3 } from '../scene/objectMeta'
import { loadTexture, paintObject, textureObject } from '../scene/appearance'

// Save/load of the 3D editor through the canonical scene-v1 (roadmap 6.1).
//
// The editor shows the plan recentred over the origin (see buildFromSceneV1),
// while scene-v1 uses absolute plan coordinates. `offset` is the plan centre:
// absolute = editor position + offset.

// --- Client mirror of contracts/scene-v1.schema.json -------------------------
export interface Vec2 {
  x: number
  z: number
}
export type Vec3 = Size3
export interface SceneV1Asset {
  id: string
  name?: string
  kind?: 'model' | 'primitive'
  source?: string
  catalogId?: string
  baseSize?: Vec3
  roomId?: string
  transform: { position: Vec3; rotation: Vec3; scale: Vec3 }
  materialId?: string
}
export interface SceneV1Light {
  id: string
  type: 'directional' | 'point' | 'spot'
  color: string
  intensity: number
  position?: Vec3
  target?: Vec3
}
export interface SceneV1Material {
  id: string
  name?: string
  color?: string
  roughness?: number
  metalness?: number
  textureUrl?: string
}
export interface SceneV1Room {
  id: string
  name?: string
  type?: string
  floorPolygon: Vec2[]
  area?: number
  materialId?: string
}
export interface SceneV1 {
  version: 'scene-v1'
  units: 'metre'
  walls: unknown[]
  rooms?: SceneV1Room[]
  assets?: SceneV1Asset[]
  lighting?: { ambient?: { color: string; intensity: number }; lights?: SceneV1Light[] }
  materials?: SceneV1Material[]
}

export const EMPTY_SCENE: SceneV1 = { version: 'scene-v1', units: 'metre', walls: [] }

// Is this a scene-v1 payload (as opposed to an old glTF save or nothing)?
export function isSceneV1(data: unknown): data is SceneV1 {
  return (data as { version?: unknown } | null)?.version === 'scene-v1'
}

// Materials the editor writes for coloured/textured assets carry this prefix,
// so a save can replace them without touching wall/room materials.
const ASSET_MATERIAL_PREFIX = 'asset-'

// Six decimals = micrometres: plenty, and keeps float noise out of the JSON.
const round = (n: number) => Math.round(n * 1e6) / 1e6
const vec3 = (v: { x: number; y: number; z: number }): Vec3 => ({
  x: round(v.x),
  y: round(v.y),
  z: round(v.z),
})

export function planOffset(scene: SceneV1 | null): Vec2 {
  return scene ? planCentreFromSceneV1(scene) : { x: 0, z: 0 }
}

function colourToHex(value: unknown, fallback: string): string {
  if (typeof value === 'number') return `#${value.toString(16).padStart(6, '0')}`
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value
  return fallback
}

export interface SaveResult {
  scene: SceneV1
  // Objects that couldn't be saved (e.g. something with no source to reload from).
  skipped: string[]
}

// Editor objects → scene-v1. Walls, rooms and wall materials come from `base`
// (the loaded scene) unchanged; assets, point lights and asset materials are
// rebuilt from the editor's objects.
export function objectsToSceneV1(
  base: SceneV1 | null,
  objects: SceneObject[],
  offset: Vec2,
): SaveResult {
  const from = base ?? EMPTY_SCENE
  const assets: SceneV1Asset[] = []
  const assetMaterials: SceneV1Material[] = []
  const lights: SceneV1Light[] = []
  const skipped: string[] = []

  const absolute = (p: THREE.Vector3): Vec3 =>
    vec3({ x: p.x + offset.x, y: p.y, z: p.z + offset.z })

  for (const o of objects) {
    const obj = o.object3d
    if (obj.userData?.isLight) {
      lights.push({
        id: o.id,
        type: 'point',
        color: colourToHex(obj.userData.lightColor, '#fff2cc'),
        intensity: Math.max(0, Number(obj.userData.intensity ?? 3)),
        position: absolute(obj.position),
      })
      continue
    }
    const meta = getMeta(obj)
    if (!meta) {
      skipped.push(o.name)
      continue
    }
    if (meta.kind !== 'model' && meta.kind !== 'primitive') continue // walls, floors

    const asset: SceneV1Asset = {
      id: o.id,
      name: o.name,
      kind: meta.kind,
      source: meta.source,
      transform: {
        position: absolute(obj.position),
        rotation: vec3(obj.rotation),
        scale: vec3(obj.scale),
      },
    }
    if (meta.catalogId) asset.catalogId = meta.catalogId
    if (meta.baseSize) asset.baseSize = vec3(meta.baseSize)
    if (meta.color || meta.textureUrl) {
      const material: SceneV1Material = { id: `${ASSET_MATERIAL_PREFIX}${o.id}` }
      if (meta.color) material.color = meta.color
      if (meta.textureUrl) material.textureUrl = meta.textureUrl
      assetMaterials.push(material)
      asset.materialId = material.id
    }
    assets.push(asset)
  }

  const scene: SceneV1 = {
    ...from,
    assets,
    materials: [
      ...(from.materials ?? []).filter((m) => !m.id.startsWith(ASSET_MATERIAL_PREFIX)),
      ...assetMaterials,
    ],
    lighting: {
      ...from.lighting,
      lights: [...(from.lighting?.lights ?? []).filter((l) => l.type !== 'point'), ...lights],
    },
  }
  return { scene, skipped }
}

// Swappable for tests (no network / WebGL there).
export interface LoadDeps {
  createModel: typeof createModelObject
  createPrimitive: typeof createPrimitiveObject
  loadTexture: typeof loadTexture
}
const defaultDeps: LoadDeps = {
  createModel: createModelObject,
  createPrimitive: createPrimitiveObject,
  loadTexture,
}

export interface LoadResult {
  objects: SceneObject[]
  // Names of assets whose model or texture couldn't be loaded.
  failed: string[]
}

async function buildAsset(
  asset: SceneV1Asset,
  materials: Map<string, SceneV1Material>,
  offset: Vec2,
  deps: LoadDeps,
): Promise<SceneObject> {
  const name = asset.name ?? 'Object'
  const source = asset.source ?? ''
  const obj =
    asset.kind === 'primitive'
      ? deps.createPrimitive((source === 'sphere' ? 'sphere' : 'cube') as PrimitiveShape)
      : await deps.createModel({
          source,
          name,
          catalogId: asset.catalogId,
          baseSize: asset.baseSize,
        })

  obj.id = asset.id
  obj.name = name
  const o3 = obj.object3d
  o3.name = name
  const { position: p, rotation: r, scale: s } = asset.transform
  o3.position.set(p.x - offset.x, p.y, p.z - offset.z)
  o3.rotation.set(r.x, r.y, r.z)
  o3.scale.set(s.x, s.y, s.z)
  o3.updateMatrixWorld(true)

  const material = asset.materialId ? materials.get(asset.materialId) : undefined
  const patch: Partial<PlacedMeta> = {}
  if (material?.color) {
    paintObject(o3, material.color)
    patch.color = material.color
  }
  if (material?.textureUrl) {
    textureObject(o3, await deps.loadTexture(material.textureUrl))
    patch.textureUrl = material.textureUrl
  }
  patchPlacedMeta(o3, patch)
  return obj
}

// scene-v1 → editor objects: walls and floors, then placed assets, then lights.
// An asset whose model can't be loaded is left out and reported in `failed`;
// the rest of the scene still opens.
export async function sceneV1ToObjects(
  scene: SceneV1,
  offset: Vec2,
  deps: LoadDeps = defaultDeps,
): Promise<LoadResult> {
  const structure = buildSceneObjectsFromSceneV1(scene)
  const materials = new Map((scene.materials ?? []).map((m) => [m.id, m]))
  const assets = scene.assets ?? []

  const settled = await Promise.allSettled(
    assets.map((a) => buildAsset(a, materials, offset, deps)),
  )
  const placed: SceneObject[] = []
  const failed: string[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') placed.push(r.value)
    else failed.push(assets[i].name ?? assets[i].id)
  })

  const lights: SceneObject[] = (scene.lighting?.lights ?? [])
    .filter((l) => l.type === 'point')
    .map((l) => {
      const light = createLight()
      light.id = l.id
      const p = l.position ?? { x: 0, y: 1.2, z: 0 }
      light.object3d.position.set(p.x - offset.x, p.y, p.z - offset.z)
      light.object3d.userData = {
        ...light.object3d.userData,
        lightColor: parseInt(l.color.slice(1), 16),
        intensity: l.intensity,
      }
      return light
    })

  return { objects: [...structure, ...placed, ...lights], failed }
}
