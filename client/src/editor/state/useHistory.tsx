import { useEffect, useRef, useState } from "react";
import type { SceneObject } from "../../types/scene";

/**
 * Deep clone a scene snapshot
 * IMPORTANT: prevents Three.js mutation bugs
 */
function cloneSnapshot(objects: SceneObject[]): SceneObject[] {
  return objects.map((o) => ({
    ...o,
    object3d: o.object3d.clone(true),
    animations: o.animations?.map((a) => a.clone()),
  }));
}

export function useHistory(objects: SceneObject[], setObjects: (o: SceneObject[]) => void) {
  const [history, setHistory] = useState<SceneObject[][]>([]);
  const [index, setIndex] = useState(-1);

  const isNavigating = useRef(false);

  /**
   * Record history automatically on object change
   */
  useEffect(() => {
    if (isNavigating.current) {
      isNavigating.current = false;
      return;
    }

    const snapshot = cloneSnapshot(objects);

    setHistory((prev) => [...prev.slice(0, index + 1), snapshot]);
    setIndex((prev) => prev + 1);
  }, [objects]);

  const undo = () => {
    if (index <= 0) return;
    isNavigating.current = true;
    const prevIndex = index - 1;
    setObjects(history[prevIndex]);
    setIndex(prevIndex);
  };

  const redo = () => {
    if (index >= history.length - 1) return;
    isNavigating.current = true;
    const nextIndex = index + 1;
    setObjects(history[nextIndex]);
    setIndex(nextIndex);
  };

  return {
    undo,
    redo,
    canUndo: index > 0,
    canRedo: index < history.length - 1,
  };
}
