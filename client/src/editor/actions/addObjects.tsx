import * as THREE from "three";
import type { SceneObject } from "../../types/scene";
import { createLight } from "../lights";

const generateId = () => crypto.randomUUID();

/**
 * Create a cube primitive
 */
export function createCube(): SceneObject {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({ color: 0x8aaaff });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = "Cube";
  mesh.position.set(Math.random() * 2 - 1, 0.5, Math.random() * 2 - 1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    id: generateId(),
    name: "Cube",
    object3d: mesh,
  };
}

/**
 * Create a sphere primitive
 */
export function createSphere(): SceneObject {
  const geometry = new THREE.SphereGeometry(0.5, 32, 32);
  const material = new THREE.MeshStandardMaterial({ color: 0xff8aaf });
  const mesh = new THREE.Mesh(geometry, material);

  mesh.name = "Sphere";
  mesh.position.set(Math.random() * 2 - 1, 0.5, Math.random() * 2 - 1);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return {
    id: generateId(),
    name: "Sphere",
    object3d: mesh,
  };
}

/**
 * Create a light object (delegated to lights domain)
 */
export function createSceneLight(): SceneObject {
  return createLight();
}
