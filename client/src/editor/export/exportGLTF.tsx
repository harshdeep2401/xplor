import * as THREE from "three";
import { GLTFExporter } from "three-stdlib";
import type { SceneObject } from "../../types/scene";

/**
 * Export scene as GLTF (JSON)
 */
export function exportGLTF(
  objects: SceneObject[],
  filename = `scene-${Date.now()}.gltf`
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
      const output = JSON.stringify(result, null, 2);
      const blob = new Blob([output], { type: "application/json" });

      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();

      URL.revokeObjectURL(link.href);
    },
    (error) => {
      console.error("GLTF export error:", error);
    },
    {
      binary: false,
      animations,
    }
  );
}
