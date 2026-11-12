import type { SceneObject } from '../../types/scene'
import { isLocked } from '../scene/objectMeta'

/**
 * Delete the selected object. Walls and floors belong to the 2D plan and stay.
 */
export function deleteObject(objects: SceneObject[], id: string | null): SceneObject[] {
  if (!id) return objects
  return objects.filter((o) => o.id !== id || isLocked(o.object3d))
}
