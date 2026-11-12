import type { SceneV1, SceneAsset, SceneMaterial, SceneLight } from './types'
import { pointInPolygon } from './roomSemantics'

// Helpers for the 3D editor's content inside a scene-v1: placed assets, the
// editor's point lights, and the materials those assets use. Pure.

// Set each asset's roomId to the room whose floor contains its position (x, z),
// or remove it when the asset stands outside every room. Returns a new scene.
export function assignAssetRooms(scene: SceneV1): SceneV1 {
  const rooms = scene.rooms ?? []
  const assets = (scene.assets ?? []).map((asset): SceneAsset => {
    const { roomId: _old, ...rest } = asset
    const p = asset.transform.position
    const room = rooms.find((r) => pointInPolygon({ x: p.x, z: p.z }, r.floorPolygon))
    return room ? { ...rest, roomId: room.id } : rest
  })
  return { ...scene, assets }
}

// A freshly converted scene only has structure (walls, rooms, default lighting).
// Keep what the user added in 3D from the scene it replaces — assets, their
// materials, and point lights — so converting the 2D plan again doesn't wipe the
// furniture. Positions are absolute plan coordinates, so they stay put. Anything
// that isn't a scene-v1 (e.g. an old glTF save) has nothing to carry over.
export function carryOverEditorContent(previous: unknown, next: SceneV1): SceneV1 {
  const prev = previous as Partial<SceneV1> | null | undefined
  if (!prev || prev.version !== 'scene-v1') return assignAssetRooms(next)

  const assets = prev.assets ?? []
  const usedMaterialIds = new Set(assets.map((a) => a.materialId).filter(Boolean))
  const nextMaterialIds = new Set((next.materials ?? []).map((m) => m.id))
  const assetMaterials: SceneMaterial[] = (prev.materials ?? []).filter(
    (m) => usedMaterialIds.has(m.id) && !nextMaterialIds.has(m.id),
  )
  const pointLights: SceneLight[] = (prev.lighting?.lights ?? []).filter((l) => l.type === 'point')

  return assignAssetRooms({
    ...next,
    assets,
    materials: [...(next.materials ?? []), ...assetMaterials],
    lighting: {
      ...next.lighting,
      lights: [...(next.lighting?.lights ?? []), ...pointLights],
    },
  })
}
