import * as THREE from "three";
import type { SceneObject } from "../../types/scene";
import { traverseMeshes, disposeTextures } from "../utils";

/**
 * Apply or remove a texture from an object
 */
export function applyTexture(
  objects: SceneObject[],
  id: string,
  file: File | null
): Promise<SceneObject[]> {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(
        objects.map((o) => {
          if (o.id !== id) return o;

          const cloned = o.object3d.clone(true);

          disposeTextures(cloned);

          traverseMeshes(cloned, (mesh) => {
            if (mesh.material && "map" in mesh.material) {
              (mesh.material as any).map = null;
              (mesh.material as any).needsUpdate = true;
            }
          });

          return { ...o, object3d: cloned };
        })
      );
      return;
    }

    const url = URL.createObjectURL(file);
    const loader = new THREE.TextureLoader();

    loader.load(
      url,
      (texture) => {
        resolve(
          objects.map((o) => {
            if (o.id !== id) return o;

            const cloned = o.object3d.clone(true);

            traverseMeshes(cloned, (mesh) => {
              if (mesh.material) {
                const mats = Array.isArray(mesh.material)
                  ? mesh.material
                  : [mesh.material];

                mats.forEach((mat: any) => {
                  mat.map = texture;
                  mat.needsUpdate = true;
                });
              }
            });

            return { ...o, object3d: cloned };
          })
        );

        URL.revokeObjectURL(url);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      }
    );
  });
}
