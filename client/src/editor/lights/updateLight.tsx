import type { SceneObject } from "../../types/scene";

/**
 * Update light intensity (immutable SceneObject update)
 */
export function updateLightIntensity(
  objects: SceneObject[],
  id: string,
  intensity: number
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);
    cloned.userData = {
      ...cloned.userData,
      intensity,
    };

    return { ...o, object3d: cloned };
  });
}

/**
 * Update light color
 */
export function updateLightColor(
  objects: SceneObject[],
  id: string,
  color: number
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);
    cloned.userData = {
      ...cloned.userData,
      lightColor: color,
    };

    return { ...o, object3d: cloned };
  });
}

/**
 * Generic helper if you add more light params later
 */
export function updateLightUserData(
  objects: SceneObject[],
  id: string,
  data: Record<string, any>
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);
    cloned.userData = {
      ...cloned.userData,
      ...data,
    };

    return { ...o, object3d: cloned };
  });
}
