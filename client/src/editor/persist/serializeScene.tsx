import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import type { SceneObject } from "../../types/scene";

/**
 * Serialize the editor's scene objects into a self-contained glTF JSON object.
 *
 * We use glTF (JSON), not GLB (binary), so the result can be stored directly in
 * the project's `canvas` JSON column and reloaded later. Geometry buffers and
 * images are embedded (data URIs), so no external files are referenced.
 *
 * The object's editor name is copied onto the Object3D so names round-trip.
 */
export function serializeScene(objects: SceneObject[]): Promise<object> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const scene = new THREE.Scene();
    const animations: THREE.AnimationClip[] = [];

    objects.forEach((o) => {
      const cloned = o.object3d.clone(true);
      cloned.name = o.name;
      scene.add(cloned);
      if (o.animations?.length) {
        animations.push(...o.animations.map((a) => a.clone()));
      }
    });

    exporter.parse(
      scene,
      (result) => {
        // With binary:false the result is the glTF JSON object.
        resolve(result as object);
      },
      (error) => reject(error),
      { binary: false, embedImages: true, animations },
    );
  });
}
