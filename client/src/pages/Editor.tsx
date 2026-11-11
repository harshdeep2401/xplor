import { useState, useEffect, useCallback, Suspense, lazy, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as THREE from 'three'
import { LoaderCircle, Move3d, Rotate3d, Scale3d } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
// Type only (erased at build), so the canvas itself stays lazily loaded.
import type { FloorPicker, TransformMode } from '../components/Editor/EditorCanvas'

import Navbar from '../components/Editor/Navbar'
import Toolbar from '../components/Editor/Toolbar'
import SceneList from '../components/Editor/SceneList'
import PropertiesPanel from '../components/Editor/PropertiesPanel'
import SuggestionsPanel from '../components/Editor/SuggestionsPanel'
import {
  fetchSuggestions,
  type FurnitureSuggestion,
  type RoomSuggestions,
} from '../services/suggestions'
import LightsFromObjects from '../components/Editor/LightsFromObjects'
import apiClient from '../services/apiClient'
import { getApiErrorMessage } from '../services/errors'
import { toast } from '../components/toast/toast'
import Button from '../components/ui/Button'
import Field from '../components/ui/Field'
import Modal from '../components/ui/Modal'

const EditorCanvas = lazy(() => import('../components/Editor/EditorCanvas'))

const TRANSFORM_MODES: { mode: TransformMode; label: string; key: string; Icon: LucideIcon }[] = [
  { mode: 'translate', label: 'Move', key: 'W', Icon: Move3d },
  { mode: 'rotate', label: 'Rotate', key: 'E', Icon: Rotate3d },
  { mode: 'scale', label: 'Resize', key: 'R', Icon: Scale3d },
]
const TRANSFORM_KEYS: Record<string, TransformMode> = { w: 'translate', e: 'rotate', r: 'scale' }

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
  updateObjectTexture,
  objectsToSceneV1,
  sceneV1ToObjects,
  planOffset,
  isSceneV1,
  type SceneV1,
} from '../editor'
import { updateLightIntensity, updateLightColor } from '../editor/lights/updateLight'
import { planBoundsFromSceneV1 } from '../editor/scene/buildFromSceneV1'
import { createModelObject } from '../editor/scene/models'
import { loadTexture } from '../editor/scene/appearance'
import { isLocked } from '../editor/scene/objectMeta'
import { ASSET_DRAG_TYPE, type CatalogAsset } from '../components/Editor/AssetList'
import type { SceneObject } from '../types/scene'

// Rule 3 (grid-fit) tuning: metres of breathing room around the plan, and the
// smallest grid we'll ever show so tiny plans still have a usable floor.
const GRID_MARGIN_M = 2
const MIN_GRID_M = 4

// Grid size (metres) for a plan of the given extent: extent + margin, floored at
// a minimum, rounded up to a whole metre for a tidy grid.
function fitGrid(extentM: number): number {
  return Math.max(MIN_GRID_M, Math.ceil(extentM + GRID_MARGIN_M))
}

export default function EditorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId } = useParams()
  const clipboardRef = useRef<SceneObject | null>(null)

  // Room dimensions live in state so a loaded project can update them.
  // Initial values come from navigation state (set when the project is created).
  const [room, setRoom] = useState(() => {
    const s = (location.state ?? {}) as {
      gridWidth?: number
      width?: number
      gridLength?: number
      length?: number
      height?: number
    }
    return {
      gridWidth: Number(s.gridWidth ?? s.width ?? 10),
      gridLength: Number(s.gridLength ?? s.length ?? 10),
      gridHeight: Number(s.height ?? 2.8),
    }
  })
  const { gridWidth, gridLength, gridHeight } = room

  // Bumped when a scene is loaded so the canvas frames the camera around it once.
  const [frameKey, setFrameKey] = useState(0)
  // Version of the active canonical Scene we loaded, for optimistic save (→ 409).
  const [sceneVersion, setSceneVersion] = useState(0)
  // The scene-v1 we loaded (walls, rooms, wall materials are saved back as-is)
  // and the plan centre the editor view is shifted by (see editor/persist/sceneV1).
  const baseSceneRef = useRef<SceneV1 | null>(null)
  const offsetRef = useRef({ x: 0, z: 0 })
  // Screen point → floor spot, provided by the canvas (drops land where released).
  const floorPickRef = useRef<FloorPicker | null>(null)

  const [projectName, setProjectName] = useState('Untitled')
  // What the handles on the selected object do (W / E / R, like most 3D tools).
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')
  const [isLoading, setIsLoading] = useState(Boolean(projectId))
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const scene = useSceneState()
  const history = useHistory(scene.objects, scene.setObjects)

  // Furniture suggestions for the scene as it is now (unsaved edits included).
  // Refreshed a moment after the scene stops changing; null = not loaded yet.
  const [suggestions, setSuggestions] = useState<RoomSuggestions[] | null>(null)
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionRoomId, setSuggestionRoomId] = useState<string | null>(null)
  const suggestionsRequest = useRef(0)

  const refreshSuggestions = useCallback(async () => {
    if (!projectId) return
    const ticket = ++suggestionsRequest.current
    setSuggestionsLoading(true)
    try {
      const { scene: current } = objectsToSceneV1(
        baseSceneRef.current,
        scene.objectsRef.current,
        offsetRef.current,
      )
      const rooms = await fetchSuggestions(projectId, current)
      if (ticket !== suggestionsRequest.current) return // a newer request won
      setSuggestions(rooms)
      setSuggestionsError(null)
    } catch (e) {
      if (ticket !== suggestionsRequest.current) return
      setSuggestionsError(getApiErrorMessage(e, 'Could not load suggestions.'))
    } finally {
      if (ticket === suggestionsRequest.current) setSuggestionsLoading(false)
    }
  }, [projectId, scene.objectsRef])

  // Load this project's saved scene (and room dimensions) on mount.
  useEffect(() => {
    if (!projectId) return
    let cancelled = false

    void (async () => {
      try {
        const { data } = await apiClient.get(`/projects/${projectId}`)
        const project = data.project ?? {}
        if (!cancelled && project.name) setProjectName(project.name)

        // The canonical 3D scene lives in the Scene table (project.canvas holds
        // only the 2D drawing): walls/rooms from the converted plan plus the
        // furniture, lights and colours added here. 404 → nothing yet.
        let sceneRes: {
          scene?: { version?: number; sceneData?: unknown; metadata?: unknown }
        } = {}
        try {
          ;({ data: sceneRes } = await apiClient.get(`/projects/${projectId}/scene`))
        } catch (e) {
          const status = (e as { response?: { status?: number } })?.response?.status
          if (status !== 404) throw e
        }
        if (cancelled) return
        setSceneVersion(sceneRes.scene?.version ?? 0)
        const sd = sceneRes.scene?.sceneData
        const grid = (sceneRes.scene?.metadata as { grid?: Record<string, unknown> } | null)?.grid

        if (isSceneV1(sd)) {
          const offset = planOffset(sd)
          baseSceneRef.current = sd
          offsetRef.current = offset
          const { objects: objs, failed } = await sceneV1ToObjects(sd, offset)
          if (cancelled) return
          scene.setObjects(objs)
          if (failed.length) {
            const what = failed.length === 1 ? '1 item' : `${failed.length} items`
            toast.error(
              `Could not load ${what}: ${failed.join(', ')}. Saving now will remove ${failed.length === 1 ? 'it' : 'them'} from the scene.`,
              { duration: 0 },
            )
          }
          // Size the grid to the plan; a plan-less 3D project keeps its saved grid.
          const bounds = planBoundsFromSceneV1(sd)
          if (bounds) {
            setRoom({
              gridWidth: fitGrid(bounds.width),
              gridLength: fitGrid(bounds.length),
              gridHeight: bounds.height,
            })
          } else if (grid) {
            setRoom({
              gridWidth: Number(grid.width ?? 10),
              gridLength: Number(grid.length ?? 10),
              gridHeight: Number(grid.height ?? 2.8),
            })
          }
          // Frame the camera around the freshly loaded scene.
          if (objs.length) setFrameKey((k) => k + 1)
        } else if (sd) {
          toast.info(
            "This 3D scene was saved in an older format that can't be opened any more. Convert the 2D plan again, or start adding objects — saving replaces the old version.",
            { duration: 0 },
          )
        }
      } catch (e) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(e, 'Could not open this 3D project.'))
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  useEffect(() => {
    if (isLoading || !projectId) return
    const timer = window.setTimeout(() => void refreshSuggestions(), 700)
    return () => window.clearTimeout(timer)
  }, [scene.objects, isLoading, projectId, refreshSuggestions])

  // Save the editor's objects into the canonical scene-v1 (walls/rooms from the
  // loaded scene, plus assets, lights and colours) and the grid size. Optimistic:
  // sends the loaded version; a stale save (re-converted or edited elsewhere) → 409.
  const handleSave = useCallback(async () => {
    if (!projectId) return
    setSaveStatus('saving')
    try {
      const { scene: sceneData, skipped } = objectsToSceneV1(
        baseSceneRef.current,
        scene.objectsRef.current,
        offsetRef.current,
      )
      const { data } = await apiClient.put(`/projects/${projectId}/scene`, {
        sceneData,
        metadata: { grid: { width: gridWidth, length: gridLength, height: gridHeight } },
        baseVersion: sceneVersion,
      })
      baseSceneRef.current = sceneData
      if (data?.scene?.version) setSceneVersion(data.scene.version)
      setSaveStatus('saved')
      if (skipped.length) {
        toast.info(`Saved, except: ${skipped.join(', ')} (no file to reload it from).`)
      }

      // Auto-store a GLB snapshot of the saved scene (best-effort; the server keeps
      // only the newest few). Failure here must not fail the save.
      try {
        const { buildGlbBlob } = await import('../editor/export/exportGLB')
        const blob = await buildGlbBlob(scene.objectsRef.current)
        const form = new FormData()
        form.append('glb', blob, 'scene.glb')
        await apiClient.post(`/projects/${projectId}/glb`, form)
      } catch {
        toast.info('Saved. The downloadable GLB copy could not be updated this time.')
      }
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        toast.error(
          'Not saved: this scene was changed elsewhere (e.g. converted again from 2D). Reload the page to get the latest version.',
          { duration: 0 },
        )
      } else {
        toast.error(getApiErrorMessage(e, 'Your scene could not be saved. Please try again.'))
      }
      setSaveStatus('error')
    }
  }, [projectId, gridWidth, gridLength, gridHeight, sceneVersion, scene.objectsRef])

  function clampToRoom(obj: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(obj)
    const size = new THREE.Vector3()
    box.getSize(size)

    const halfX = size.x / 2
    const halfY = size.y / 2
    const halfZ = size.z / 2

    obj.position.x = THREE.MathUtils.clamp(
      obj.position.x,
      -gridWidth / 2 + halfX,
      gridWidth / 2 - halfX,
    )

    obj.position.y = THREE.MathUtils.clamp(obj.position.y, halfY, gridHeight - halfY)

    obj.position.z = THREE.MathUtils.clamp(
      obj.position.z,
      -gridLength / 2 + halfZ,
      gridLength / 2 - halfZ,
    )
  }

  const handleCopy = () => {
    if (!scene.selectedId) return
    const selectedObject = scene.objects.find((obj) => obj.id === scene.selectedId)
    if (selectedObject && !isLocked(selectedObject.object3d)) {
      clipboardRef.current = selectedObject
    }
  }

  const handlePaste = () => {
    if (!clipboardRef.current) return

    const clonedObject3d = clipboardRef.current.object3d.clone(true)

    // Offset the pasted object slightly so it's not in the exact same position
    clonedObject3d.position.x += 0.5
    clonedObject3d.position.z += 0.5
    clampToRoom(clonedObject3d)

    const pastedObject: SceneObject = {
      id: crypto.randomUUID(),
      name: clipboardRef.current.name,
      object3d: clonedObject3d,
      animations: clipboardRef.current.animations?.map((a) => a.clone()),
    }

    scene.setObjects((prev) => [...prev, pastedObject])
    scene.setSelectedId(pastedObject.id)
  }

  useKeyboardShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    onDelete: () => {
      scene.setObjects((prev) => deleteObject(prev, scene.selectedId))
      scene.setSelectedId(null)
    },
    onCopy: handleCopy,
    onPaste: handlePaste,
    onMoveObject: (direction, e) => {
      if (!scene.selectedId) return

      const normalStep = 0.05
      const fastStep = 0.2
      const step = e.shiftKey ? fastStep : normalStep

      scene.setObjects((prev) =>
        prev.map((obj) => {
          if (obj.id !== scene.selectedId || isLocked(obj.object3d)) return obj
          const o = obj.object3d

          switch (direction) {
            case 'up':
              if (e.shiftKey) o.position.y += step
              else o.position.z -= step
              break
            case 'down':
              if (e.shiftKey) o.position.y -= step
              else o.position.z += step
              break
            case 'left':
              o.position.x -= step
              break
            case 'right':
              o.position.x += step
              break
          }

          clampToRoom(o)
          return { ...obj }
        }),
      )
    },
  })

  // W = move, E = rotate, R = resize (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const mode = TRANSFORM_KEYS[e.key.toLowerCase()]
      if (mode) setTransformMode(mode)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const [showExportModal, setShowExportModal] = useState(false)
  const [exportFilename, setExportFilename] = useState('')

  // Store a file from the user's disk on the server so the saved scene can
  // reload it. Without a project (nothing to save into) it stays in this session.
  const storeFile = async (file: File): Promise<{ url: string; saved: boolean }> => {
    if (!projectId) return { url: URL.createObjectURL(file), saved: false }
    const form = new FormData()
    form.append('file', file)
    const { data } = await apiClient.post(`/projects/${projectId}/files`, form)
    return { url: data.url as string, saved: true }
  }

  // Put a new object on the floor at `at` (editor coordinates, kept on the grid),
  // or — with no spot — on a simple grid near the middle so repeated adds don't
  // stack on one spot.
  const addPlaced = (obj: SceneObject, at?: { x: number; z: number } | null) => {
    if (at) {
      obj.object3d.position.set(
        THREE.MathUtils.clamp(at.x, -gridWidth / 2, gridWidth / 2),
        0,
        THREE.MathUtils.clamp(at.z, -gridLength / 2, gridLength / 2),
      )
    } else {
      const n = scene.objectsRef.current.filter((o) => !isLocked(o.object3d)).length
      obj.object3d.position.set(
        THREE.MathUtils.clamp((n % 4) * 0.8 - 1.2, -gridWidth / 2 + 0.5, gridWidth / 2 - 0.5),
        0,
        THREE.MathUtils.clamp(
          Math.floor(n / 4) * 0.8 - 1.2,
          -gridLength / 2 + 0.5,
          gridLength / 2 - 0.5,
        ),
      )
    }
    obj.object3d.updateMatrixWorld(true)
    scene.setObjects((prev) => [...prev, obj])
    scene.setSelectedId(obj.id)
  }

  const handleFileImport = async (file: File | null) => {
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.glb')) {
      toast.error(`Could not import "${file.name}". Use a .glb model file.`)
      return
    }
    try {
      const { url } = await storeFile(file)
      const name = file.name.replace(/\.glb$/i, '')
      addPlaced(await createModelObject({ source: url, name }))
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, `Could not import "${file.name}". Use a valid .glb model file.`),
      )
    }
  }

  const handleUrlImport = async (url: string) => {
    try {
      const file = url.split(/[?#]/)[0].split('/').pop() || 'Model'
      const name = decodeURIComponent(file).replace(/\.(glb|gltf)$/i, '')
      addPlaced(await createModelObject({ source: url, name }))
    } catch {
      toast.error(
        'Could not load a model from that link. Check the URL points to a .glb or .gltf file.',
      )
    }
  }

  // Drop from the furniture library: the item is fitted to its real-world size
  // from the catalog, so it lands in scale.
  const handleAssetDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE)
    if (!raw) return
    let item: CatalogAsset
    try {
      item = JSON.parse(raw) as CatalogAsset
    } catch {
      return
    }
    // Where it was released, before the model finishes loading.
    const at = floorPickRef.current?.(e.clientX, e.clientY) ?? null
    try {
      addPlaced(
        await createModelObject({
          source: item.fileUrl,
          name: item.name,
          catalogId: item.id,
          baseSize: item.dimensions ?? undefined,
        }),
        at,
      )
    } catch {
      toast.error(`Could not add "${item.name}" to the scene. Please try again.`)
    }
  }

  // One-click add from the Suggestions panel: the item goes exactly where the
  // recommender found room for it (positions come back in plan coordinates).
  const handleAddSuggestion = async (s: FurnitureSuggestion) => {
    try {
      const obj = await createModelObject({
        source: s.item.fileUrl,
        name: s.item.name,
        catalogId: s.item.id,
        baseSize: s.item.dimensions ?? undefined,
      })
      const { position: p, rotationY } = s.placement
      obj.object3d.position.set(p.x - offsetRef.current.x, p.y, p.z - offsetRef.current.z)
      obj.object3d.rotation.set(0, rotationY, 0)
      obj.object3d.updateMatrixWorld(true)
      scene.setObjects((prev) => [...prev, obj])
      scene.setSelectedId(obj.id)
    } catch {
      toast.error(`Could not add "${s.item.name}". Please try again.`)
    }
  }

  const handleTextureUpdate = async (id: string, file: File | null) => {
    if (!file) {
      scene.setObjects((prev) => updateObjectTexture(prev, id, null, null))
      return
    }
    try {
      const { url, saved } = await storeFile(file)
      const texture = await loadTexture(url)
      scene.setObjects((prev) => updateObjectTexture(prev, id, texture, saved ? url : null))
    } catch (e) {
      toast.error(
        getApiErrorMessage(e, 'Could not apply that texture. Use a PNG, JPG or WEBP image.'),
      )
    }
  }

  const handleExportGLTF = async () => {
    try {
      const { exportGLTF } = await import('../editor/export/exportGLTF')
      await exportGLTF(scene.objectsRef.current)
      toast.success('Exported the scene as GLTF.')
    } catch {
      toast.error('Could not export the scene as GLTF.')
    }
  }

  const handleExportGLB = async () => {
    const filename = `${exportFilename || 'scene'}.glb`
    setShowExportModal(false)
    setExportFilename('')
    try {
      const { exportGLB } = await import('../editor/export/exportGLB')
      await exportGLB(scene.objectsRef.current, filename)
      toast.success(`Exported ${filename}.`)
    } catch {
      toast.error('Could not export the scene as GLB.')
    }
  }

  return (
    <div className="flex flex-col h-screen bg-app text-ink">
      <Navbar
        projectName={projectName}
        subtitle={`${gridWidth} × ${gridLength} × ${gridHeight} m`}
        saveStatus={saveStatus}
        onBack={() => navigate('/dashboard')}
        onSave={handleSave}
        onUndo={history.undo}
        onRedo={history.redo}
        onVrPreview={() => toast.info('VR preview is coming in a later version.')}
      />

      <div className="flex flex-1 min-h-0">
        <Toolbar
          addCube={() => scene.setObjects((prev) => [...prev, createCube()])}
          addSphere={() => scene.setObjects((prev) => [...prev, createSphere()])}
          addLight={() => scene.setObjects((prev) => [...prev, createSceneLight()])}
          handleFile={handleFileImport}
          deleteSelected={() => {
            scene.setObjects((prev) => deleteObject(prev, scene.selectedId))
            scene.setSelectedId(null)
          }}
          exportGLTF={handleExportGLTF}
          exportGLB={() => setShowExportModal(true)}
          saveToBackend={handleSave}
          selectedId={scene.selectedId}
          onImportFromUrl={handleUrlImport}
        />

        <div
          className="flex-1 relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleAssetDrop}
        >
          {/* Move / Rotate / Resize for the selected object */}
          <div
            role="toolbar"
            aria-label="Transform mode"
            className="absolute left-3 top-3 z-10 flex gap-1 rounded-xl border border-solid border-line bg-surface/90 p-1 backdrop-blur"
          >
            {TRANSFORM_MODES.map(({ mode, label, key, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTransformMode(mode)}
                aria-pressed={transformMode === mode}
                title={`${label} (${key})`}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 py-1.5 text-xs font-semibold ${
                  transformMode === mode
                    ? 'bg-primary text-white'
                    : 'bg-transparent text-ink-soft hover:bg-white/5'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {label}
                <kbd className="font-mono text-[10px] opacity-60">{key}</kbd>
              </button>
            ))}
          </div>
          {!scene.selectedId && !isLoading && scene.objects.length > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-surface/80 px-3 py-1.5 text-xs text-muted">
              Click an object to select it, then drag its handles.
            </p>
          )}
          {isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-app/70 text-ink-soft">
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              Loading project…
            </div>
          )}
          <Canvas shadows camera={{ position: [gridWidth, gridWidth, gridLength], fov: 50 }}>
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
                hasRoom={scene.objects.some((o) => o.name === 'Room')}
                frameKey={frameKey}
                transformMode={transformMode}
                floorPickRef={floorPickRef}
              />
            </Suspense>

            <LightsFromObjects objects={scene.objects} />
          </Canvas>
        </div>

        <div className="w-80 bg-surface border-0 border-l border-solid border-line p-4 overflow-y-auto">
          {projectId && (
            <SuggestionsPanel
              rooms={suggestions}
              loading={suggestionsLoading}
              error={suggestionsError}
              roomId={suggestionRoomId}
              onRoomChange={setSuggestionRoomId}
              onAdd={handleAddSuggestion}
              onRefresh={refreshSuggestions}
            />
          )}
          <SceneList
            objects={scene.objects}
            selectedId={scene.selectedId}
            onSelect={scene.setSelectedId}
          />

          <PropertiesPanel
            objects={scene.objects}
            selectedId={scene.selectedId}
            updateTransform={(id, field, axis, value) =>
              scene.setObjects((prev) => updateTransform(prev, id, field, axis, value))
            }
            updateObjectName={(id, name) =>
              scene.setObjects((prev) => updateObjectName(prev, id, name))
            }
            updateObjectColor={(id, color) =>
              scene.setObjects((prev) => updateObjectColor(prev, id, color))
            }
            updateLightIntensity={(id, intensity) =>
              scene.setObjects((prev) => updateLightIntensity(prev, id, intensity))
            }
            updateLightColor={(id, color) =>
              scene.setObjects((prev) => updateLightColor(prev, id, color))
            }
            updateObjectTexture={handleTextureUpdate}
          />
        </div>
      </div>

      <Modal
        open={showExportModal}
        title="Export Scene as GLB"
        onClose={() => setShowExportModal(false)}
        footer={
          <>
            <Button onClick={() => setShowExportModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleExportGLB}>
              Export
            </Button>
          </>
        }
      >
        <Field
          label="File name"
          placeholder="scene"
          hint=".glb is added for you."
          value={exportFilename}
          onChange={(e) => setExportFilename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleExportGLB()
          }}
        />
      </Modal>
    </div>
  )
}
