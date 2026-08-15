import * as THREE from "three";
import type { SceneObject } from "../../types/scene";

interface LightsFromObjectsProps {
  objects: SceneObject[];
}

export default function LightsFromObjects({ objects }: LightsFromObjectsProps) {
  const tmpCenter = new THREE.Vector3();
  const tmpBox = new THREE.Box3();

  // 🔧 Toggle this later for Preview / Render mode
  const ENABLE_SHADOWS = true;

  return (
    <>
      {objects.map((o) => {
        const isLamp =
          /lamp|light/i.test(o.name) || o.object3d.userData?.isLight;

        if (!isLamp) return null;

        const color = o.object3d.userData?.lightColor ?? 0xfff2cc;
        const intensity = o.object3d.userData?.intensity ?? 2;
        const distance = o.object3d.userData?.distance ?? 10;
        const decay = o.object3d.userData?.decay ?? 2;

        const offset: [number, number, number] =
          o.object3d.userData?.offset ?? [0, 0.15, 0];

        // Get object center
        tmpBox.setFromObject(o.object3d).getCenter(tmpCenter);

        const pos: [number, number, number] = [
          tmpCenter.x + offset[0],
          tmpCenter.y + offset[1],
          tmpCenter.z + offset[2],
        ];

        return (
          <pointLight
            key={`light-${o.id}`}
            position={pos}
            color={color}
            intensity={intensity}
            distance={distance}
            decay={decay}
            castShadow={ENABLE_SHADOWS}
            {...(ENABLE_SHADOWS
              ? {
                  "shadow-bias": -0.0015,
                  "shadow-normalBias": 0.04,
                  "shadow-mapSize": [1024, 1024],
                }
              : {})}
          />
        );
      })}
    </>
  );
}
