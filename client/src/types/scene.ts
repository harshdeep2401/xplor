import * as THREE from "three";

export type SceneObject = {
  id: string;
  name: string;
  object3d: THREE.Object3D;

  animations?: THREE.AnimationClip[];
};


export type TransformField = "position" | "rotation" | "scale";
export type TransformAxis = "x" | "y" | "z";