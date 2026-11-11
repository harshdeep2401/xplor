import type * as THREE from 'three'
import type { SceneObject, TransformAxis, TransformField } from '../../types/scene'
import { paintObject, textureObject } from '../scene/appearance'
import { patchPlacedMeta } from '../scene/objectMeta'

/**
 * Update position / rotation / scale
 */
export function updateTransform(
  objects: SceneObject[],
  id: string,
  field: TransformField,
  axis: TransformAxis,
  value: number,
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o

    const cloned = o.object3d.clone(true)
    cloned[field][axis] = value

    return { ...o, object3d: cloned }
  })
}

/**
 * Update display + internal name
 */
export function updateObjectName(objects: SceneObject[], id: string, name: string): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o

    const cloned = o.object3d.clone(true)
    cloned.name = name

    return { ...o, name, object3d: cloned }
  })
}

/**
 * Recolour every mesh of an object (remembered so it's saved with the scene).
 */
export function updateObjectColor(
  objects: SceneObject[],
  id: string,
  colorHex: string,
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o

    const cloned = o.object3d.clone(true)
    paintObject(cloned, colorHex)
    patchPlacedMeta(cloned, { color: colorHex })

    return { ...o, object3d: cloned }
  })
}

/**
 * Apply a texture to an object, or remove it (texture/url null).
 * `url` is where the image is stored, so the texture is saved with the scene.
 */
export function updateObjectTexture(
  objects: SceneObject[],
  id: string,
  texture: THREE.Texture | null,
  url: string | null,
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o

    const cloned = o.object3d.clone(true)
    textureObject(cloned, texture)
    patchPlacedMeta(cloned, { textureUrl: url ?? undefined })

    return { ...o, object3d: cloned }
  })
}
