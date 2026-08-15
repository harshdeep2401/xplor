import * as THREE from "three";

/**
 * Moves an Object3D so its lowest point touches y = 0
 */
export function groundObject(obj: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(obj);
  const minY = box.min.y;

  if (isFinite(minY)) {
    obj.position.y -= minY;
  }
}
