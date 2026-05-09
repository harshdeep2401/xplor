// components/PropertiesPanel.tsx
import type {
  SceneObject,
  TransformAxis,
  TransformField,
} from "../../types/scene";
import * as THREE from "three";

type PropertiesPanelProps = {
  objects: SceneObject[];
  selectedId: string | null;
  updateTransform: (
    id: string,
    field: TransformField,
    axis: TransformAxis,
    value: number,
  ) => void;
  updateObjectName?: (id: string, name: string) => void;
  updateObjectColor?: (id: string, colorHex: string) => void;

  updateLightIntensity?: (id: string, intensity: number) => void;
  updateLightColor?: (id: string, colorHex: number) => void;

  updateObjectTexture?: (id: string, file: File | null) => void;
};

export default function PropertiesPanel({
  objects,
  selectedId,
  updateTransform,
  updateObjectName,
  updateObjectColor,
  updateLightIntensity,
  updateLightColor,
  updateObjectTexture,
}: PropertiesPanelProps) {
  const selectedObject = selectedId
    ? objects.find((o) => o.id === selectedId)
    : null;

  // Extract material color
  const getCurrentColorHex = () => {
    if (!selectedObject) return "#ffffff";
    let found: string | null = null;

    selectedObject.object3d.traverse((child: any) => {
      if (found) return;
      if (child.isMesh && child.material) {
        const mat = Array.isArray(child.material)
          ? child.material[0]
          : child.material;
        if (mat?.color?.isColor) {
          found = `#${mat.color.getHexString()}`;
        }
      }
    });
    return found || "#ffffff";
  };

  // Extract light intensity
  const getCurrentIntensity = () => {
    if (!selectedObject) return 1;
    const val = selectedObject.object3d.userData?.intensity;
    return typeof val === "number" ? val : 1;
  };

  // Extract light color
  const getCurrentLightColor = () => {
    if (!selectedObject) return "#ffffff";
    const hex = selectedObject.object3d.userData?.lightColor;
    return "#" + (hex || 0xffffff).toString(16).padStart(6, "0");
  };

  const isLight = selectedObject?.object3d?.userData?.isLight === true;

  return (
    <div
      key={selectedId || "empty-panel"}
      className="space-y-4 transition-opacity duration-300 ease-in-out"
    >
      <h3 className="font-semibold text-white mt-4 text-lg">Properties</h3>

      {!selectedObject ? (
        <div className="mt-2 p-4 rounded-xl bg-gray-800 text-sm text-gray-400 shadow-md">
          Select an object to see its properties.
        </div>
      ) : (
        <>
          {/* NAME */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 className="text-sm text-gray-200 mb-2">Name</h4>
            <input
              type="text"
              value={selectedObject.name}
              onChange={(e) => updateObjectName?.(selectedId!, e.target.value)}
              className="w-full p-2 bg-gray-700 border-gray-600 rounded text-white"
            />
          </div>

          {/* COLOR (material) */}
          {!isLight && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-sm text-gray-200 mb-2">Color</h4>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={getCurrentColorHex()}
                  onChange={(e) =>
                    updateObjectColor?.(selectedId!, e.target.value)
                  }
                  className="w-12 h-8 cursor-pointer"
                />
                <span className="text-xs text-gray-400">Material color</span>
              </div>
            </div>
          )}

          {/* TEXTURE UPLOAD */}
          {!isLight && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-sm text-gray-200 mb-2">Texture (Diffuse)</h4>

              <div className="flex items-center gap-2">
                <input
                  id="texture-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (updateObjectTexture && selectedId) {
                      updateObjectTexture(selectedId, file);
                    }
                    (e.target as HTMLInputElement).value = "";
                  }}
                  className="text-sm text-gray-200 cursor-pointer"
                />
              </div>

              {/* Remove texture */}
              <button
                onClick={() => updateObjectTexture?.(selectedId!, null)}
                className="mt-3 px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-xs text-white"
              >
                Remove Texture
              </button>
            </div>
          )}

          {/* POSITION */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 className="text-sm text-gray-200 mb-3">Position</h4>
            <div className="grid grid-cols-3 gap-2">
              {(["x", "y", "z"] as TransformAxis[]).map((axis) => (
                <div key={axis} className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                    {axis.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    step={0.1}
                    value={Number(
                      selectedObject.object3d.position[axis],
                    ).toFixed(2)}
                    onChange={(e) =>
                      updateTransform(
                        selectedId!,
                        "position",
                        axis,
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-full pl-6 bg-gray-700 border-gray-600 rounded text-white text-right"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* SCALE */}
          <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <h4 className="text-sm text-gray-200 mb-3">Scale</h4>

            <input
              type="number"
              step={0.1}
              value={selectedObject.object3d.scale.x.toFixed(2)}
              onChange={(e) =>
                ["x", "y", "z"].forEach((axis) =>
                  updateTransform(
                    selectedId!,
                    "scale",
                    axis as TransformAxis,
                    parseFloat(e.target.value) || 1,
                  ),
                )
              }
              className="w-full p-2 bg-gray-700 border-gray-600 rounded text-white mb-2"
            />

            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={selectedObject.object3d.scale.x}
              onChange={(e) =>
                ["x", "y", "z"].forEach((axis) =>
                  updateTransform(
                    selectedId!,
                    "scale",
                    axis as TransformAxis,
                    parseFloat(e.target.value),
                  ),
                )
              }
              className="w-full accent-green-500 cursor-pointer"
            />
          </div>

          {/* LIGHT SETTINGS */}
          {isLight && (
            <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <h4 className="text-sm text-gray-200 mb-3">Light Settings</h4>

              {/* INTENSITY */}
              <label className="text-xs text-gray-300 block mb-2">
                Intensity
              </label>
              <div className="flex items-center space-x-3 mb-4">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={getCurrentIntensity()}
                  onChange={(e) =>
                    updateLightIntensity?.(
                      selectedId!,
                      parseFloat(e.target.value),
                    )
                  }
                  className="flex-1 cursor-pointer accent-blue-500"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={parseFloat(getCurrentIntensity().toFixed(1))}
                  onChange={(e) =>
                    updateLightIntensity?.(
                      selectedId!,
                      parseFloat(e.target.value) || 0,
                    )
                  }
                  className="w-16 p-2 bg-gray-700 border border-gray-600 rounded text-white text-right"
                />
              </div>

              {/* LIGHT COLOR */}
              <label className="text-xs text-gray-300">Light Color</label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={getCurrentLightColor()}
                  onChange={(e) =>
                    updateLightColor?.(
                      selectedId!,
                      new THREE.Color(e.target.value).getHex(),
                    )
                  }
                  className="w-12 h-8 cursor-pointer"
                />
                <span className="text-xs text-gray-400">
                  Emitted light color
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
