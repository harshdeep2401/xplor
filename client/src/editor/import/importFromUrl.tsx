import { GLTFLoader } from "three-stdlib";
import type { SceneObject } from "../../types/scene";
import { groundObject } from "../utils";

const generateId = () => crypto.randomUUID();

/**
 * Import GLTF from a remote URL
 */
export function importFromUrl(
  url: string
): Promise<SceneObject[]> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        const objects: SceneObject[] = [];
        const root = gltf.scene.clone(true);

        groundObject(root);

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
                name: child.name || "imported-model",
                object3d: child,
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
            name: "imported-model",
            object3d: root,
          });
        }

        resolve(objects);
      },
      undefined,
      (err) => reject(err)
    );
  });
}
