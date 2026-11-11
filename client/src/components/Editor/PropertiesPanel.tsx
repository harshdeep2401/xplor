// components/PropertiesPanel.tsx
import type { SceneObject, TransformAxis, TransformField } from '../../types/scene'
import * as THREE from 'three'
import { isLocked } from '../../editor/scene/objectMeta'

type PropertiesPanelProps = {
  objects: SceneObject[]
  selectedId: string | null
  updateTransform: (id: string, field: TransformField, axis: TransformAxis, value: number) => void
  updateObjectName?: (id: string, name: string) => void
  updateObjectColor?: (id: string, colorHex: string) => void

  updateLightIntensity?: (id: string, intensity: number) => void
  updateLightColor?: (id: string, colorHex: number) => void

  updateObjectTexture?: (id: string, file: File | null) => void
}

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
  const selectedObject = selectedId ? objects.find((o) => o.id === selectedId) : null

  // Extract material color
  const getCurrentColorHex = () => {
    if (!selectedObject) return '#ffffff'
    let found: string | null = null

    selectedObject.object3d.traverse((child) => {
      if (found) return
      if (child instanceof THREE.Mesh && child.material) {
        const mat = (Array.isArray(child.material) ? child.material[0] : child.material) as
          { color?: THREE.Color } | undefined
        if (mat?.color?.isColor) {
          found = `#${mat.color.getHexString()}`
        }
      }
    })
    return found || '#ffffff'
  }

  // Extract light intensity
  const getCurrentIntensity = () => {
    if (!selectedObject) return 1
    const val = selectedObject.object3d.userData?.intensity
    return typeof val === 'number' ? val : 1
  }

  // Extract light color
  const getCurrentLightColor = () => {
    if (!selectedObject) return '#ffffff'
    const hex = selectedObject.object3d.userData?.lightColor
    return '#' + (hex || 0xffffff).toString(16).padStart(6, '0')
  }

  const isLight = selectedObject?.object3d?.userData?.isLight === true

  return (
    <div
      key={selectedId || 'empty-panel'}
      className="space-y-4 transition-opacity duration-300 ease-in-out"
    >
      <h3 className="font-semibold text-ink mt-6 text-lg">Properties</h3>

      {!selectedObject ? (
        <div className="p-4 rounded-xl bg-surface-2 text-sm text-muted">
          Select an object to see its properties.
        </div>
      ) : isLocked(selectedObject.object3d) ? (
        <div className="p-4 rounded-xl bg-surface-2 text-sm text-muted">
          <div className="mb-1 font-medium text-ink">{selectedObject.name}</div>
          Walls and floors come from the 2D plan. Change them in the 2D editor, then convert again —
          your furniture stays where it is.
        </div>
      ) : (
        <>
          {/* NAME */}
          <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
            <h4 className="text-sm font-medium text-ink-soft mb-2">Name</h4>
            <input
              type="text"
              value={selectedObject.name}
              onChange={(e) => updateObjectName?.(selectedId!, e.target.value)}
              className="w-full p-2 rounded-lg border border-solid border-line bg-field/60 text-ink text-sm outline-none focus:border-primary"
            />
          </div>

          {/* COLOR (material) */}
          {!isLight && (
            <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
              <h4 className="text-sm font-medium text-ink-soft mb-2">Color</h4>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={getCurrentColorHex()}
                  onChange={(e) => updateObjectColor?.(selectedId!, e.target.value)}
                  className="w-12 h-8 cursor-pointer"
                />
                <span className="text-xs text-muted">Material color</span>
              </div>
            </div>
          )}

          {/* TEXTURE UPLOAD */}
          {!isLight && (
            <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
              <h4 className="text-sm font-medium text-ink-soft mb-2">Texture (Diffuse)</h4>

              <div className="flex items-center gap-2">
                <input
                  id="texture-upload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null
                    if (updateObjectTexture && selectedId) {
                      updateObjectTexture(selectedId, file)
                    }
                    ;(e.target as HTMLInputElement).value = ''
                  }}
                  className="text-sm text-ink-soft cursor-pointer"
                />
              </div>

              {/* Remove texture */}
              <button
                onClick={() => updateObjectTexture?.(selectedId!, null)}
                className="mt-3 cursor-pointer rounded-md border-0 bg-danger/90 px-3 py-1 text-xs font-semibold text-white hover:bg-danger"
              >
                Remove Texture
              </button>
            </div>
          )}

          {/* POSITION */}
          <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
            <h4 className="text-sm font-medium text-ink-soft mb-3">Position</h4>
            <div className="grid grid-cols-3 gap-2">
              {(['x', 'y', 'z'] as TransformAxis[]).map((axis) => (
                <div key={axis} className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted">
                    {axis.toUpperCase()}
                  </span>
                  <input
                    type="number"
                    step={0.1}
                    value={Number(selectedObject.object3d.position[axis]).toFixed(2)}
                    onChange={(e) =>
                      updateTransform(
                        selectedId!,
                        'position',
                        axis,
                        parseFloat(e.target.value) || 0,
                      )
                    }
                    className="w-full py-1.5 pl-6 pr-2 text-right rounded-lg border border-solid border-line bg-field/60 text-ink text-sm outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* SCALE */}
          <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
            <h4 className="text-sm font-medium text-ink-soft mb-3">Scale</h4>

            <input
              type="number"
              step={0.1}
              value={selectedObject.object3d.scale.x.toFixed(2)}
              onChange={(e) =>
                ['x', 'y', 'z'].forEach((axis) =>
                  updateTransform(
                    selectedId!,
                    'scale',
                    axis as TransformAxis,
                    parseFloat(e.target.value) || 1,
                  ),
                )
              }
              className="w-full p-2 mb-2 rounded-lg border border-solid border-line bg-field/60 text-ink text-sm outline-none focus:border-primary"
            />

            <input
              type="range"
              min="0.1"
              max="10"
              step="0.1"
              value={selectedObject.object3d.scale.x}
              onChange={(e) =>
                ['x', 'y', 'z'].forEach((axis) =>
                  updateTransform(
                    selectedId!,
                    'scale',
                    axis as TransformAxis,
                    parseFloat(e.target.value),
                  ),
                )
              }
              className="w-full accent-primary cursor-pointer"
            />
          </div>

          {/* LIGHT SETTINGS */}
          {isLight && (
            <div className="bg-surface-2 rounded-xl p-4 border border-solid border-line">
              <h4 className="text-sm font-medium text-ink-soft mb-3">Light Settings</h4>

              {/* INTENSITY */}
              <label className="text-xs text-ink-soft block mb-2">Intensity</label>
              <div className="flex items-center space-x-3 mb-4">
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={getCurrentIntensity()}
                  onChange={(e) => updateLightIntensity?.(selectedId!, parseFloat(e.target.value))}
                  className="flex-1 cursor-pointer accent-primary"
                />
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  value={parseFloat(getCurrentIntensity().toFixed(1))}
                  onChange={(e) =>
                    updateLightIntensity?.(selectedId!, parseFloat(e.target.value) || 0)
                  }
                  className="w-16 p-2 text-right rounded-lg border border-solid border-line bg-field/60 text-ink text-sm outline-none focus:border-primary"
                />
              </div>

              {/* LIGHT COLOR */}
              <label className="text-xs text-ink-soft">Light Color</label>
              <div className="flex items-center space-x-3">
                <input
                  type="color"
                  value={getCurrentLightColor()}
                  onChange={(e) =>
                    updateLightColor?.(selectedId!, new THREE.Color(e.target.value).getHex())
                  }
                  className="w-12 h-8 cursor-pointer"
                />
                <span className="text-xs text-muted">Emitted light color</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
