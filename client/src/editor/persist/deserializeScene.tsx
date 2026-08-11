import { GLTFLoader } from "three-stdlib";
import type { SceneObject } from "../../types/scene";

const generateId = () => crypto.randomUUID();

/**
 * Rebuild editor scene objects from a glTF JSON payload previously produced by
 * serializeScene(). Each top-level node in the loaded scene becomes one
 * SceneObject, mirroring how importFromFile() wraps imported models.
 */
export function deserializeScene(gltfJson: unknown): Promise<SceneObject[]> {
  return new Promise((resolve, reject) => {
    if (!gltfJson) {
      resolve([]);
      return;
    }

    const loader = new GLTFLoader();
    const json =
      typeof gltfJson === "string" ? gltfJson : JSON.stringify(gltfJson);

    loader.parse(
      json,
      "",
      (gltf) => {
        const objects: SceneObject[] = [];
        // Snapshot children first — reparenting via <primitive> later mutates
        // the live array otherwise.
        const children = [...gltf.scene.children];

        children.forEach((child) => {
          child.traverse((sub: any) => {
            if (sub.isMesh) {
              sub.castShadow = true;
              sub.receiveShadow = true;
            }
          });

          objects.push({
            id: generateId(),
            name: child.name || "Object",
            object3d: child,
            animations: gltf.animations?.map((a) => a.clone()),
          });
        });

        resolve(objects);
      },
      (err) => reject(err),
    );
  });
}
