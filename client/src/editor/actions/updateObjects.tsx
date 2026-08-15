import * as THREE from "three";
import type { SceneObject, TransformAxis, TransformField } from "../../types/scene";
import { traverseMeshes } from "../utils";

/**
 * Update position / rotation / scale
 */
export function updateTransform(
  objects: SceneObject[],
  id: string,
  field: TransformField,
  axis: TransformAxis,
  value: number
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);
    (cloned as any)[field][axis] = value;

    return { ...o, object3d: cloned };
  });
}

/**
 * Update display + internal name
 */
export function updateObjectName(
  objects: SceneObject[],
  id: string,
  name: string
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);
    cloned.name = name;

    return { ...o, name, object3d: cloned };
  });
}

/**
 * Update material color (supports multi-material meshes)
 */
export function updateObjectColor(
  objects: SceneObject[],
  id: string,
  colorHex: string
): SceneObject[] {
  return objects.map((o) => {
    if (o.id !== id) return o;

    const cloned = o.object3d.clone(true);

    traverseMeshes(cloned, (mesh) => {
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];

      materials.forEach((mat: any) => {
        if (mat?.color) {
          mat.color = new THREE.Color(colorHex);
          mat.needsUpdate = true;
        }
      });
    });

    return { ...o, object3d: cloned };
  });
}
