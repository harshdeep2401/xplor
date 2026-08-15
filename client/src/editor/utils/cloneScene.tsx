import type { SceneObject } from "../../types/scene";

/**
 * Deep clone scene objects
 * Prevents Three.js mutation bugs in undo/redo
 */
export function cloneScene(objects: SceneObject[]): SceneObject[] {
  return objects.map((o) => ({
    ...o,
    object3d: o.object3d.clone(true),
    animations: o.animations?.map((a) => a.clone()),
  }));
}
