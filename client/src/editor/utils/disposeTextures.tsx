import * as THREE from "three";
import { traverseMeshes } from "./traverseMeshes";

/**
 * Dispose all textures & materials inside an Object3D
 * Call before replacing materials or deleting objects
 */
export function disposeTextures(root: THREE.Object3D) {
  traverseMeshes(root, (mesh) => {
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];

    materials.forEach((mat) => {
      if (!mat) return;

      // Dispose textures
      Object.values(mat).forEach((value) => {
        if (value instanceof THREE.Texture) {
          value.dispose();
        }
      });

      mat.dispose();
    });
  });
}
