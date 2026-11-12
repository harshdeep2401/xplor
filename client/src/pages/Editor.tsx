// The 3D editor. This page only wires the pieces together:
//   state & behaviour  pages/editor3d/*   (scene load/save, suggestions,
//                      placing objects, keyboard, exports)
//   rendering          components/Editor/*   (navbar, toolbar, canvas, panels)
//   pure logic         editor/*   (scene-v1 persistence, models, room bounds)
import { Suspense, lazy, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
// Type only (erased at build), so the canvas itself stays lazily loaded.
import type { FloorPicker } from '../components/Editor/EditorCanvas'
import Navbar from '../components/Editor/Navbar'
import Toolbar from '../components/Editor/Toolbar'
import SceneList from '../components/Editor/SceneList'
import PropertiesPanel from '../components/Editor/PropertiesPanel'
import SuggestionsPanel from '../components/Editor/SuggestionsPanel'
import LightsFromObjects from '../components/Editor/LightsFromObjects'
import TransformModeBar from '../components/Editor/TransformModeBar'
import ExportGlbModal from '../components/Editor/ExportGlbModal'
import { toast } from '../components/toast/toast'
import {
  useSceneState,
  useHistory,
  createCube,
  createSphere,
  createSceneLight,
  updateTransform,
  updateObjectName,
  updateObjectColor,
} from '../editor'
import { updateLightIntensity, updateLightColor } from '../editor/lights/updateLight'
import { roomFromNavigation } from '../editor/scene/room'
import { useSceneDocument } from './editor3d/useSceneDocument'
import { useSuggestions } from './editor3d/useSuggestions'
import { usePlacement } from './editor3d/usePlacement'
import { useSceneShortcuts } from './editor3d/useSceneShortcuts'
import { useSceneExports } from './editor3d/useSceneExports'

const EditorCanvas = lazy(() => import('../components/Editor/EditorCanvas'))

export default function EditorPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { projectId } = useParams()

  const scene = useSceneState()
  const history = useHistory(scene.objects, scene.setObjects)
  // The room starts at the size picked on the dashboard; a loaded plan resizes it.
  const doc = useSceneDocument(projectId, roomFromNavigation(location.state), scene)
  const { room } = doc

  const suggestions = useSuggestions({
    projectId,
    ready: !doc.isLoading,
    objects: scene.objects,
    currentScene: doc.currentScene,
  })
  // Screen point → floor spot, provided by the canvas (drops land where released).
  const floorPickRef = useRef<FloorPicker | null>(null)
  const place = usePlacement({
    projectId,
    room,
    scene,
    offsetRef: doc.offsetRef,
    floorPickRef,
  })
  const keys = useSceneShortcuts({ scene, history, room })
  const exports = useSceneExports(scene.objectsRef)

  const edit = (fn: Parameters<typeof scene.setObjects>[0]) => scene.setObjects(fn)

  return (
    <div className="flex flex-col h-screen bg-app text-ink">
      <Navbar
        projectName={doc.projectName}
        subtitle={`${room.width} × ${room.length} × ${room.height} m`}
        saveStatus={doc.saveStatus}
        onBack={() => navigate('/dashboard')}
        onSave={doc.save}
        onUndo={history.undo}
        onRedo={history.redo}
        onVrPreview={() => toast.info('VR preview is coming in a later version.')}
      />

      <div className="flex flex-1 min-h-0">
        <Toolbar
          addCube={() => edit((prev) => [...prev, createCube()])}
          addSphere={() => edit((prev) => [...prev, createSphere()])}
          addLight={() => edit((prev) => [...prev, createSceneLight()])}
          handleFile={place.importFile}
          deleteSelected={keys.deleteSelected}
          exportGLTF={exports.exportGltf}
          exportGLB={exports.glb.show}
          saveToBackend={doc.save}
          selectedId={scene.selectedId}
          onImportFromUrl={place.importUrl}
        />

        <div
          className="flex-1 relative"
          onDragOver={(e) => e.preventDefault()}
          onDrop={place.dropAsset}
        >
          <TransformModeBar mode={keys.transformMode} onChange={keys.setTransformMode} />
          {!scene.selectedId && !doc.isLoading && scene.objects.length > 0 && (
            <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-surface/80 px-3 py-1.5 text-xs text-muted">
              Click an object to select it, then drag its handles.
            </p>
          )}
          {doc.isLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center gap-3 bg-app/70 text-ink-soft">
              <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              Loading project…
            </div>
          )}
          <Canvas shadows camera={{ position: [room.width, room.width, room.length], fov: 50 }}>
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />
            <Suspense fallback={null}>
              <EditorCanvas
                objects={scene.objects}
                selectedId={scene.selectedId}
                onSelect={scene.setSelectedId}
                gridWidth={room.width}
                gridLength={room.length}
                gridHeight={room.height}
                hasRoom={scene.objects.some((o) => o.name === 'Room')}
                frameKey={doc.frameKey}
                transformMode={keys.transformMode}
                floorPickRef={floorPickRef}
              />
            </Suspense>
            <LightsFromObjects objects={scene.objects} />
          </Canvas>
        </div>

        <div className="w-80 bg-surface border-0 border-l border-solid border-line p-4 overflow-y-auto">
          {projectId && (
            <SuggestionsPanel
              rooms={suggestions.rooms}
              loading={suggestions.loading}
              error={suggestions.error}
              roomId={suggestions.roomId}
              onRoomChange={suggestions.setRoomId}
              onAdd={place.addSuggestion}
              onRefresh={suggestions.refresh}
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
              edit((prev) => updateTransform(prev, id, field, axis, value))
            }
            updateObjectName={(id, name) => edit((prev) => updateObjectName(prev, id, name))}
            updateObjectColor={(id, color) => edit((prev) => updateObjectColor(prev, id, color))}
            updateLightIntensity={(id, intensity) =>
              edit((prev) => updateLightIntensity(prev, id, intensity))
            }
            updateLightColor={(id, color) => edit((prev) => updateLightColor(prev, id, color))}
            updateObjectTexture={place.setTexture}
          />
        </div>
      </div>

      <ExportGlbModal
        open={exports.glb.open}
        name={exports.glb.name}
        onNameChange={exports.glb.setName}
        onCancel={exports.glb.close}
        onExport={() => void exports.glb.confirm()}
      />
    </div>
  )
}
