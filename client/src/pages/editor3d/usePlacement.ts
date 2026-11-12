import type { RefObject } from 'react'
import apiClient from '../../services/apiClient'
import { getApiErrorMessage } from '../../services/errors'
import { catalogAssetSchema } from '../../services/apiSchemas'
import type { FurnitureSuggestion } from '../../services/suggestions'
import { toast } from '../../components/toast/toast'
import { ASSET_DRAG_TYPE } from '../../components/Editor/AssetList'
import type { FloorPicker } from '../../components/Editor/EditorCanvas'
import { updateObjectTexture } from '../../editor'
import { createModelObject } from '../../editor/scene/models'
import { loadTexture } from '../../editor/scene/appearance'
import { isLocked } from '../../editor/scene/objectMeta'
import { clampToGrid, defaultSpot, type RoomSize } from '../../editor/scene/room'
import type { SceneObject } from '../../types/scene'
import type { SceneState } from './types'

interface PlacementDeps {
  projectId: string | undefined
  room: RoomSize
  scene: SceneState
  // Plan centre: suggestion spots come in plan coordinates.
  offsetRef: RefObject<{ x: number; z: number }>
  // Screen point → floor spot (from the canvas), for drops.
  floorPickRef: RefObject<FloorPicker | null>
}

// Bringing things into the scene: furniture dropped from the library or added
// from a suggestion, models imported from disk or a link, and textures.
// Files from disk are stored on the server first, so a saved scene can reload them.
export function usePlacement({ projectId, room, scene, offsetRef, floorPickRef }: PlacementDeps) {
  // Store a file from the user's disk on the server so the saved scene can
  // reload it. Without a project (nothing to save into) it stays in this session.
  const storeFile = async (file: File): Promise<{ url: string; saved: boolean }> => {
    if (!projectId) return { url: URL.createObjectURL(file), saved: false }
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.post(`/projects/${projectId}/files`, form)
    return { url: data.url as string, saved: true }
  }

  // Put a new object on the floor at `at` (editor coordinates, kept on the
  // grid), or — with no spot — at the next default spot; then select it.
  const addPlaced = (obj: SceneObject, at?: { x: number; z: number } | null) => {
    const unlocked = scene.objectsRef.current.filter((o) => !isLocked(o.object3d)).length
    const spot = at ? clampToGrid(at, room) : defaultSpot(unlocked, room)
    obj.object3d.position.set(spot.x, 0, spot.z)
    obj.object3d.updateMatrixWorld(true)
    scene.setObjects((prev) => [...prev, obj])
    scene.setSelectedId(obj.id)
  }

  const importFile = async (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) {
      toast.error(`Could not import "${file.name}". Use a .glb model file.`)
      return
    }
    try {
      const { url } = await storeFile(file)
      const name = file.name.replace(/\.glb$/i, '')
      addPlaced(await createModelObject({ source: url, name }))
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, `Could not import "${file.name}". Use a valid .glb model file.`),
      )
    }
  }

  const importUrl = async (url: string) => {
    try {
      const file = url.split(/[?#]/)[0].split('/').pop() || 'Model'
      const name = decodeURIComponent(file).replace(/\.(glb|gltf)$/i, '')
      addPlaced(await createModelObject({ source: url, name }))
    } catch {
      toast.error(
        'Could not load a model from that link. Check the URL points to a .glb or .gltf file.',
      )
    }
  }

  // Drop from the furniture library: the item is fitted to its real-world size
  // from the catalog, so it lands in scale, where it was released.
  const dropAsset = async (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE)
    if (!raw) return
    // The payload crosses a drag-and-drop boundary; ignore anything that isn't
    // a catalog item (a drop from another page or app, say).
    let item
    try {
      const parsed = catalogAssetSchema.safeParse(JSON.parse(raw))
      if (!parsed.success) return
      item = parsed.data
    } catch {
      return
    }
    // Where it was released, before the model finishes loading.
    const at = floorPickRef.current?.(e.clientX, e.clientY) ?? null
    try {
      addPlaced(
        await createModelObject({
          source: item.fileUrl,
          name: item.name,
          catalogId: item.id,
          baseSize: item.dimensions ?? undefined,
        }),
        at,
      )
    } catch {
      toast.error(`Could not add "${item.name}" to the scene. Please try again.`)
    }
  }

  // One-click add from the Suggestions panel: the item goes exactly where the
  // recommender found room for it.
  const addSuggestion = async (s: FurnitureSuggestion) => {
    try {
      const obj = await createModelObject({
        source: s.item.fileUrl,
        name: s.item.name,
        catalogId: s.item.id,
        baseSize: s.item.dimensions ?? undefined,
      })
      const { position: p, rotationY } = s.placement
      const offset = offsetRef.current ?? { x: 0, z: 0 }
      obj.object3d.position.set(p.x - offset.x, p.y, p.z - offset.z)
      obj.object3d.rotation.set(0, rotationY, 0)
      obj.object3d.updateMatrixWorld(true)
      scene.setObjects((prev) => [...prev, obj])
      scene.setSelectedId(obj.id)
    } catch {
      toast.error(`Could not add "${s.item.name}". Please try again.`)
    }
  }

  // A texture from disk onto an object (null removes it).
  const setTexture = async (id: string, file: File | null) => {
    if (!file) {
      scene.setObjects((prev) => updateObjectTexture(prev, id, null, null))
      return
    }
    try {
      const { url, saved } = await storeFile(file)
      const texture = await loadTexture(url)
      scene.setObjects((prev) => updateObjectTexture(prev, id, texture, saved ? url : null))
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, 'Could not apply that texture. Use a PNG, JPG or WEBP image.'),
      )
    }
  }

  return { importFile, importUrl, dropAsset, addSuggestion, setTexture }
}
