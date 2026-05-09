import  { useRef } from "react";
import { TransformControls as TransformControlsImpl } from "three-stdlib";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";

type TransformControlWrapperProps = {
  object: THREE.Object3D | null;
  onTransform?: () => void;
};

export default function TransformControlWrapper({
  object,
  onTransform,
}: TransformControlWrapperProps) {
  const ctrlRef = useRef<TransformControlsImpl>(null);

  if (!object) return null;

  return (
    <TransformControls
      ref={ctrlRef}
      object={object}
      mode="translate"
      showX
      showY
      showZ
      onChange={onTransform}
    />
  );
}
