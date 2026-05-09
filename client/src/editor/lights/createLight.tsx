import * as THREE from "three";
import type { SceneObject } from "../../types/scene";

/**
 * Create a logical light represented by a bulb mesh.
 * Actual Three.js light is created elsewhere (LightsFromObjects).
 */
export function createLight(): SceneObject {
  const geometry = new THREE.SphereGeometry(0.2, 16, 16);
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffee,
    emissiveIntensity: 2.5,
    roughness: 0.3,
    metalness: 0.0,
  });

  const bulb = new THREE.Mesh(geometry, material);
  bulb.name = "Light";
  bulb.position.set(0, 1.2, 0);

  // Important: visual only
  bulb.castShadow = false;
  bulb.receiveShadow = false;

  // Logical light data (source of truth)
  bulb.userData = {
    isLight: true,
    lightColor: 0xfff2cc,
    intensity: 3,
    distance: 10,
    decay: 2,
    offset: [0, 0.15, 0],
  };

  return {
    id: crypto.randomUUID(),
    name: "Light",
    object3d: bulb,
  };
}
