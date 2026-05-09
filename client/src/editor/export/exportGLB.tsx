import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import type { SceneObject } from "../../types/scene";

/**
 * Export scene as GLB (binary)
 */
export function exportGLB(
  objects: SceneObject[],
  filename = "scene.glb"
) {
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
      if (!(result instanceof ArrayBuffer)) return;

      const blob = new Blob([result], {
        type: "application/octet-stream",
      });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();

      URL.revokeObjectURL(link.href);
    },
    (error) => {
      console.error("GLB export error:", error);
    },
    {
      binary: true,
      animations,
    }
  );
}
