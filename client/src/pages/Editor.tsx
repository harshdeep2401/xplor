import { useState, Suspense, lazy, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { useLocation } from "react-router-dom";
import * as THREE from "three";

import Navbar from "../components/Editor/Navbar";
import Toolbar from "../components/Editor/Toolbar";
import SceneList from "../components/Editor/SceneList";
import PropertiesPanel from "../components/Editor/PropertiesPanel";
import LightsFromObjects from "../components/Editor/LightsFromObjects";

const EditorCanvas = lazy(() => import("../components/Editor/EditorCanvas"));

import {
  useSceneState,
  useHistory,
  useKeyboardShortcuts,
  createCube,
  createSphere,
  createSceneLight,
  deleteObject,
  updateTransform,
  updateObjectName,
  updateObjectColor,
} from "../editor";
import {
  updateLightIntensity,
  updateLightColor,
} from "../editor/lights/updateLight";
import type { SceneObject } from "../types/scene";

export default function EditorPage() {
  const location = useLocation();
  const clipboardRef = useRef<SceneObject | null>(null);

  let gridWidth = 10;
  let gridLength = 10;
  let gridHeight = 2.8;

  if (location.state) {
    gridWidth = Number(location.state.gridWidth ?? location.state.width ?? 10);
    gridLength = Number(
      location.state.gridLength ?? location.state.length ?? 10,
    );
    gridHeight = Number(location.state.height ?? 2.8);
  }

  const scene = useSceneState();
  const history = useHistory(scene.objects, scene.setObjects);

  function clampToRoom(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = new THREE.Vector3();
    box.getSize(size);

    const halfX = size.x / 2;
    const halfY = size.y / 2;
    const halfZ = size.z / 2;

    obj.position.x = THREE.MathUtils.clamp(
      obj.position.x,
      -gridWidth / 2 + halfX,
      gridWidth / 2 - halfX,
    );

    obj.position.y = THREE.MathUtils.clamp(
      obj.position.y,
      halfY,
      gridHeight - halfY,
    );

    obj.position.z = THREE.MathUtils.clamp(
      obj.position.z,
      -gridLength / 2 + halfZ,
      gridLength / 2 - halfZ,
    );
  }

  const handleCopy = () => {
    if (!scene.selectedId) return;
    const selectedObject = scene.objects.find(
      (obj) => obj.id === scene.selectedId,
    );
    if (selectedObject) {
      clipboardRef.current = selectedObject;
    }
  };

  const handlePaste = () => {
    if (!clipboardRef.current) return;

    const clonedObject3d = clipboardRef.current.object3d.clone(true);

    // Offset the pasted object slightly so it's not in the exact same position
    clonedObject3d.position.x += 0.5;
    clonedObject3d.position.z += 0.5;
    clampToRoom(clonedObject3d);

    const pastedObject: SceneObject = {
      id: crypto.randomUUID(),
      name: clipboardRef.current.name,
      object3d: clonedObject3d,
      animations: clipboardRef.current.animations?.map((a) => a.clone()),
    };

    scene.setObjects((prev) => [...prev, pastedObject]);
    scene.setSelectedId(pastedObject.id);
  };

  useKeyboardShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    onDelete: () => {
      scene.setObjects((prev) => deleteObject(prev, scene.selectedId));
      scene.setSelectedId(null);
    },
    onCopy: handleCopy,
    onPaste: handlePaste,
    onMoveObject: (direction, e) => {
      if (!scene.selectedId) return;

      const normalStep = 0.05;
      const fastStep = 0.2;
      const step = e.shiftKey ? fastStep : normalStep;

      scene.setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== scene.selectedId) return obj;
          const o = obj.object3d;

          switch (direction) {
            case "up":
              e.shiftKey ? (o.position.y += step) : (o.position.z -= step);
              break;
            case "down":
              e.shiftKey ? (o.position.y -= step) : (o.position.z += step);
              break;
            case "left":
              o.position.x -= step;
              break;
            case "right":
              o.position.x += step;
              break;
          }

          clampToRoom(o);
          return { ...obj };
        }),
      );
    },
  });

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFilename, setExportFilename] = useState("");

  const handleFileImport = async (file: File | null) => {
    if (!file) return;
    const { importFromFile } = await import("../editor/import/importFromFile");
    const newObjects = await importFromFile(file);
    scene.setObjects((prev) => [...prev, ...newObjects]);
  };

  const handleUrlImport = async (url: string) => {
    const { importFromUrl } = await import("../editor/import/importFromUrl");
    const newObjects = await importFromUrl(url);
    scene.setObjects((prev) => [...prev, ...newObjects]);
  };

  const handleTextureUpdate = async (id: string, file: File | null) => {
    const { applyTexture } = await import("../editor/import/applyTexture");
    const updated = await applyTexture(scene.objects, id, file);
    scene.setObjects(updated);
  };

  const handleExportGLTF = async () => {
    const { exportGLTF } = await import("../editor/export/exportGLTF");
    exportGLTF(scene.objectsRef.current);
  };

  const handleExportGLB = async () => {
    const { exportGLB } = await import("../editor/export/exportGLB");
    exportGLB(scene.objectsRef.current, `${exportFilename || "scene"}.glb`);
    setShowExportModal(false);
    setExportFilename("");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-700 text-white">
      <Navbar
        projectName="MY PROJECT"
        onSave={() => console.log("Save to backend")}
        onUndo={history.undo}
        onRedo={history.redo}
        onVrPreview={() => console.log("VR Preview")}
      />

      <div className="flex flex-1 min-h-0">
        <Toolbar
          addCube={() => scene.setObjects((prev) => [...prev, createCube()])}
          addSphere={() =>
            scene.setObjects((prev) => [...prev, createSphere()])
          }
          addLight={() =>
            scene.setObjects((prev) => [...prev, createSceneLight()])
          }
          handleFile={handleFileImport}
          deleteSelected={() => {
            scene.setObjects((prev) => deleteObject(prev, scene.selectedId));
            scene.setSelectedId(null);
          }}
          exportGLTF={handleExportGLTF}
          exportGLB={() => setShowExportModal(true)}
          saveToBackend={() => console.log("Save")}
          selectedId={scene.selectedId}
          onImportFromUrl={handleUrlImport}
        />

        <div className="flex-1 relative">
          <Canvas
            shadows
            camera={{ position: [gridWidth, gridWidth, gridLength], fov: 50 }}
          >
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />

            <Suspense fallback={null}>
              <EditorCanvas
                objects={scene.objects}
                selectedId={scene.selectedId}
                onSelect={scene.setSelectedId}
                gridWidth={gridWidth}
                gridLength={gridLength}
                gridHeight={gridHeight}
                hasRoom={scene.objects.some((o) => o.name === "Room")}
              />
            </Suspense>

            <LightsFromObjects objects={scene.objects} />
          </Canvas>
        </div>

        <div className="w-80 bg-gray-900 p-4 overflow-y-auto">
          <SceneList
            objects={scene.objects}
            selectedId={scene.selectedId}
            onSelect={scene.setSelectedId}
          />

          <PropertiesPanel
            objects={scene.objects}
            selectedId={scene.selectedId}
            updateTransform={(id, field, axis, value) =>
              scene.setObjects((prev) =>
                updateTransform(prev, id, field, axis, value),
              )
            }
            updateObjectName={(id, name) =>
              scene.setObjects((prev) => updateObjectName(prev, id, name))
            }
            updateObjectColor={(id, color) =>
              scene.setObjects((prev) => updateObjectColor(prev, id, color))
            }
            updateLightIntensity={(id, intensity) =>
              scene.setObjects((prev) =>
                updateLightIntensity(prev, id, intensity),
              )
            }
            updateLightColor={(id, color) =>
              scene.setObjects((prev) => updateLightColor(prev, id, color))
            }
            updateObjectTexture={handleTextureUpdate}
          />
        </div>
      </div>

      {/* ✅ EXPORT MODAL */}
      {showExportModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/60 z-50">
          <div className="bg-gray-800 p-6 rounded-lg w-96 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Export Scene as GLB</h2>

            <input
              type="text"
              placeholder="Enter file name"
              value={exportFilename}
              onChange={(e) => setExportFilename(e.target.value)}
              className="w-full p-2 rounded bg-gray-700 text-white mb-4 outline-none"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500"
              >
                Cancel
              </button>

              <button
                onClick={handleExportGLB}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
