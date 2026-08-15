import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import type { SceneObject } from "../../types/scene";

/**
 * Serialize the editor objects to a binary GLB Blob. Shared by the download
 * helper (below) and the auto-store-on-save upload (Editor.tsx).
 */
export function buildGlbBlob(objects: SceneObject[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    const scene = new THREE.Scene();
    const animations: THREE.AnimationClip[] = [];

    objects.forEach((o) => {
      const cloned = o.object3d.clone(true);
      scene.add(cloned);
      if (o.animations?.length) {
        animations.push(...o.animations.map((a) => a.clone()));
      }
    });

    exporter.parse(
      scene,
      (result) => {
        if (!(result instanceof ArrayBuffer)) {
          reject(new Error("GLB export did not return binary data"));
          return;
        }
        resolve(new Blob([result], { type: "model/gltf-binary" }));
      },
      (error) => reject(error),
      { binary: true, animations },
    );
  });
}

/**
 * Export scene as GLB (binary) and trigger a browser download.
 */
export async function exportGLB(objects: SceneObject[], filename = "scene.glb") {
  try {
    const blob = await buildGlbBlob(objects);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  } catch (error) {
    console.error("GLB export error:", error);
  }
}
