import React, { useRef, useEffect } from "react";
import * as THREE from "three";
import type { SceneObject } from "../../types/scene";

type ModelProps = {
  obj: SceneObject;
  setRef?: (ref: THREE.Object3D | null) => void;
};

export default function Model({ obj, setRef }: ModelProps) {
  const ref = useRef<THREE.Object3D>(null);

  useEffect(() => {
    if (setRef) setRef(ref.current);
  }, [setRef]);

  return (
    <primitive
      object={obj.object3d}
      ref={ref as any}
      key={obj.id}
      onPointerDown={(e: React.PointerEvent) => {
        e.stopPropagation();
      }}
    />
  );
}
