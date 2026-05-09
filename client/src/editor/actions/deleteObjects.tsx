import type { SceneObject } from "../../types/scene";

/**
 * Delete selected object
 */
export function deleteObject(
  objects: SceneObject[],
  id: string | null
): SceneObject[] {
  if (!id) return objects;
  return objects.filter((o) => o.id !== id);
}
