import { GLTFLoader } from "three-stdlib";
import type { SceneObject } from "../../types/scene";
import { groundObject } from "../utils"

const generateId = () => crypto.randomUUID();

/**
 * Import GLTF/GLB from local file
 */
export function importFromFile(
  file: File
): Promise<SceneObject[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        const objects: SceneObject[] = [];
        const root = gltf.scene.clone(true);

        groundObject(root);

        const animations = gltf.animations?.map((a) => a.clone());

        let added = false;

        if (root.children.length > 0) {
          root.children.forEach((child) => {
            if ((child as any).isMesh || (child as any).isGroup) {
              groundObject(child);

              child.traverse((sub: any) => {
                if (sub.isMesh) {
                  sub.castShadow = true;
                  sub.receiveShadow = true;
                }
              });

              objects.push({
                id: generateId(),
                name: child.name || file.name,
                object3d: child,
                animations,
              });

              added = true;
            }
          });
        }

        if (!added) {
          root.traverse((child: any) => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });

          objects.push({
            id: generateId(),
            name: file.name,
            object3d: root,
            animations,
          });
        }

        URL.revokeObjectURL(url);
        resolve(objects);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(url);
        reject(err);
      }
    );
  });
}
