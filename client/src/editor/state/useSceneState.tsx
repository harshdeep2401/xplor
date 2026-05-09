import { useRef, useState, useEffect } from "react";
import type { SceneObject } from "../../types/scene";

export function useSceneState() {
  const [objects, setObjects] = useState<SceneObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /**
   * Ref always pointing to latest objects
   * Needed for export / async actions
   */
  const objectsRef = useRef<SceneObject[]>(objects);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  return {
    objects,
    setObjects,
    objectsRef,

    selectedId,
    setSelectedId,
  };
}
