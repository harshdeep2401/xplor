import * as THREE from "three";

/**
 * Traverse all meshes inside an Object3D
 */
export function traverseMeshes(
  root: THREE.Object3D,
  callback: (mesh: THREE.Mesh) => void
) {
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      callback(child as THREE.Mesh);
    }
  });
}
