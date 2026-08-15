// utils/collision.ts
import * as THREE from "three";

export function intersects(a: THREE.Object3D, b: THREE.Object3D) {
  const boxA = new THREE.Box3().setFromObject(a);
  const boxB = new THREE.Box3().setFromObject(b);
  return boxA.intersectsBox(boxB);
}

export function getAllBoxes(objects: THREE.Object3D[]) {
  return objects.map(obj => ({
    obj,
    box: new THREE.Box3().setFromObject(obj)
  }));
}
