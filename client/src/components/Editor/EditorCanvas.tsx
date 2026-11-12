import { useEffect, useMemo, useRef, useState } from 'react'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { OrbitControls, TransformControls } from '@react-three/drei'
import * as THREE from 'three'
import type { SceneObject } from '../../types/scene'
import { isFloor, isLocked } from '../../editor/scene/objectMeta'
import { keepInRoom } from '../../editor/scene/room'

function createRectGridGeometry(width: number, length: number, step = 1) {
  const safeStep = Math.max(0.1, step)
  const halfW = width / 2
  const halfL = length / 2

  const vertices: number[] = []

  // Lines parallel to X (vary Z)
  const zSteps = Math.floor(length / safeStep)
  for (let i = 0; i <= zSteps; i++) {
    const z = -halfL + i * safeStep
    vertices.push(-halfW, 0, z, halfW, 0, z)
  }
  const lastZ = -halfL + zSteps * safeStep
  if (Math.abs(lastZ - halfL) > 1e-6) {
    vertices.push(-halfW, 0, halfL, halfW, 0, halfL)
  }

  // Lines parallel to Z (vary X)
  const xSteps = Math.floor(width / safeStep)
  for (let i = 0; i <= xSteps; i++) {
    const x = -halfW + i * safeStep
    vertices.push(x, 0, -halfL, x, 0, halfL)
  }
  const lastX = -halfW + xSteps * safeStep
  if (Math.abs(lastX - halfW) > 1e-6) {
    vertices.push(halfW, 0, -halfL, halfW, 0, halfL)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return geometry
}

function createRectGridCenterLinesGeometry(width: number, length: number) {
  const halfW = width / 2
  const halfL = length / 2
  const vertices = [
    -halfW,
    0,
    0,
    halfW,
    0,
    0, // X axis
    0,
    0,
    -halfL,
    0,
    0,
    halfL, // Z axis
  ]

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  return geometry
}

// Position an orbit-style camera so `box` fits in view: pull back along a fixed
// diagonal by a distance proportional to the box's largest dimension, and aim at
// its centre. Shared by single-object focus and whole-scene frame-on-load.
function frameCameraOnBox(camera: THREE.Camera, box: THREE.Box3) {
  if (box.isEmpty()) return
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const maxDim = Math.max(size.x, size.y, size.z, 1)
  const distance = maxDim * 1.2 + 2
  const offset = new THREE.Vector3(distance, distance * 0.6, distance)
  camera.position.copy(center.clone().add(offset))
  camera.lookAt(center)
  ;(camera as THREE.PerspectiveCamera).updateProjectionMatrix?.()
}

// Objects closer than this don't count as touching, so a TV standing on its
// stand or a chair pushed against a wall isn't a collision.
const TOUCH_TOLERANCE = 0.01
// Rugs, mats and other flat things lie under furniture and never collide.
const FLAT_HEIGHT = 0.05

function solidBox(obj: THREE.Object3D): THREE.Box3 | null {
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty() || box.max.y - box.min.y < FLAT_HEIGHT) return null
  return box.expandByScalar(-TOUCH_TOLERANCE)
}

// Ids of the objects `obj` currently overlaps.
function overlapping(obj: THREE.Object3D, others: SceneObject[]): Set<string> {
  const hits = new Set<string>()
  const box = solidBox(obj)
  if (!box) return hits
  for (const o of others) {
    const other = solidBox(o.object3d)
    if (other && box.intersectsBox(other)) hits.add(o.id)
  }
  return hits
}

interface EditorCanvasProps {
  objects: SceneObject[]
  onSelect: (id: string | null) => void
  selectedId: string | null
  setObjectsRef?: (arr: SceneObject[]) => void
  onTransform?: () => void
  gridWidth?: number
  gridLength?: number
  gridHeight?: number
  hasRoom?: boolean
  initialFocusId?: string
  // Bumped by the parent when a scene is (re)loaded; triggers a one-shot camera
  // frame around all objects. Rule 4: converted plans open fully in view.
  frameKey?: number
  // What the handles on the selected object do: move, rotate or resize it.
  transformMode?: TransformMode
  // Filled in by the canvas: screen point → spot on the floor (y = 0) under it,
  // in editor coordinates, or null when the pointer isn't over the floor.
  floorPickRef?: React.MutableRefObject<FloorPicker | null>
}

export type FloorPicker = (clientX: number, clientY: number) => { x: number; z: number } | null

export type TransformMode = 'translate' | 'rotate' | 'scale'

// Rotation handles turn in 15° steps, so objects line up with walls easily.
const ROTATION_SNAP = THREE.MathUtils.degToRad(15)

const EditorCanvas: React.FC<EditorCanvasProps> = ({
  objects,
  onSelect,
  selectedId,
  setObjectsRef,
  onTransform,
  gridWidth = 10,
  gridLength = 10,
  gridHeight = 1.0,
  hasRoom = false,
  initialFocusId,
  frameKey,
  transformMode = 'translate',
  floorPickRef,
}) => {
  const { gl, camera } = useThree()

  useEffect(() => {
    if (!floorPickRef) return
    const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    floorPickRef.current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect()
      const pointer = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      )
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.ray.intersectPlane(floor, new THREE.Vector3())
      return hit ? { x: hit.x, z: hit.z } : null
    }
    return () => {
      floorPickRef.current = null
    }
  }, [gl, camera, floorPickRef])
  // Auto-focus camera ONCE per focus target (prevents camera jumping on every object update).
  const focusId = useMemo(() => {
    if (initialFocusId) return initialFocusId
    return objects.find((o) => o.name === 'Room')?.id ?? null
  }, [initialFocusId, objects])

  const lastAutoFocusIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!focusId) return
    if (lastAutoFocusIdRef.current === focusId) return

    const focusObj = objects.find((o) => o.id === focusId)
    if (!focusObj) return

    const box = new THREE.Box3().setFromObject(focusObj.object3d)
    frameCameraOnBox(camera, box)

    lastAutoFocusIdRef.current = focusId
  }, [focusId, objects, camera])

  // Rule 4: frame the whole scene when it's (re)loaded. Runs once per frameKey
  // change (a discrete load event), not on every object edit, so the user's own
  // camera moves aren't undone. Used for the "Convert → land in 3D" path, where
  // there's no single focus object.
  useEffect(() => {
    if (!frameKey) return
    if (objects.length === 0) return
    const box = new THREE.Box3()
    for (const o of objects) box.expandByObject(o.object3d)
    frameCameraOnBox(camera, box)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey])

  const gridGeometry = useMemo(
    () => createRectGridGeometry(gridWidth, gridLength, 1),
    [gridWidth, gridLength],
  )
  const gridCenterGeometry = useMemo(
    () => createRectGridCenterLinesGeometry(gridWidth, gridLength),
    [gridWidth, gridLength],
  )

  const selectedObject = useMemo(
    () => objects.find((o) => o.id === selectedId),
    [objects, selectedId],
  )

  // Keep external ref updated
  useEffect(() => {
    if (setObjectsRef) setObjectsRef(objects)
  }, [objects, setObjectsRef])

  // Local state: whether a transform control is active (dragging)
  const [isTransforming, setIsTransforming] = useState(false)
  const lastValidPosRef = useRef<Map<string, THREE.Vector3>>(new Map())
  useEffect(() => {
    const so = objects.find((o) => o.id === selectedId)
    if (so) {
      lastValidPosRef.current.set(so.id, so.object3d.position.clone())
    }
  }, [selectedId, objects])

  // The active gizmo; while the pointer is over one of its handles, a click
  // drives the gizmo and must not re-select whatever lies underneath.
  const gizmoRef = useRef<{ axis: string | null; dragging: boolean } | null>(null)

  // Pointer selection
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const gizmo = gizmoRef.current
      if (gizmo && (gizmo.axis || gizmo.dragging)) return
      const rect = gl.domElement.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const y = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const pointer = new THREE.Vector2(x, y)
      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(pointer, camera)

      const targetObjects = objects.map((o) => o.object3d)
      const intersects = raycaster.intersectObjects(targetObjects, true)

      if (intersects.length > 0) {
        let cur: THREE.Object3D | null = intersects[0].object

        while (cur && cur.parent) {
          const hit: THREE.Object3D = cur
          const foundDirect = objects.find(
            (o) => o.object3d === hit || hit.uuid === o.object3d.uuid,
          )
          if (foundDirect) {
            onSelect(foundDirect.id)
            return
          }
          cur = cur.parent
        }

        // Fallback, though the loop above should handle most cases
        const found = objects.find(
          (o) =>
            o.object3d === intersects[0].object || intersects[0].object?.uuid === o.object3d.uuid,
        )
        if (found) {
          onSelect(found.id)
          return
        }
      }

      onSelect(null)
    }

    gl.domElement.addEventListener('pointerdown', handlePointerDown)
    return () => gl.domElement.removeEventListener('pointerdown', handlePointerDown)
  }, [gl, camera, objects, onSelect])

  // Keep the selected object inside the grid volume and stop moves that push it
  // into another object. Placed objects have their origin at the bottom centre,
  // so bounds are taken from the actual box, not from the origin.
  const handleTransform = () => {
    if (!selectedObject) return
    const obj = selectedObject.object3d

    keepInRoom(obj, { width: gridWidth, length: gridLength, height: gridHeight })

    // Collisions only while moving: reverting a position can't undo a rotation
    // or resize, and would leave the object jumping back and forth.
    if (transformMode !== 'translate') {
      onTransform?.()
      return
    }

    const last = lastValidPosRef.current.get(selectedObject.id)
    const blockers = collidersFor(selectedObject.id)
    const hits = overlapping(obj, blockers)
    let blocked = false
    if (hits.size > 0 && last) {
      // Only new contacts block: an object that already overlaps something
      // (dropped into a wall, say) can still be moved out of it.
      const now = obj.position.clone()
      obj.position.copy(last)
      obj.updateMatrixWorld(true)
      const before = overlapping(obj, blockers)
      blocked = [...hits].some((id) => !before.has(id))
      if (!blocked) {
        obj.position.copy(now)
        obj.updateMatrixWorld(true)
      }
    }
    if (!blocked) lastValidPosRef.current.set(selectedObject.id, obj.position.clone())

    onTransform?.()
  }

  // Everything the moving object can bump into: not itself, not floors.
  const collidersFor = (id: string) =>
    objects.filter((o) => o.id !== id && o.name !== 'Room' && !isFloor(o.object3d))

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={0.8} />

      {/* Rectangular grid with consistent 1m cell spacing */}
      <group position={[0, 0.001, 0]}>
        <lineSegments geometry={gridGeometry}>
          <lineBasicMaterial
            color={hasRoom ? 0xffffff : 0xffffff}
            transparent
            opacity={hasRoom ? 0.45 : 0.7}
          />
        </lineSegments>
        <lineSegments geometry={gridCenterGeometry}>
          <lineBasicMaterial
            color={hasRoom ? 0x2b2b2b : 0x5a5a5a}
            transparent
            opacity={hasRoom ? 0.7 : 0.9}
          />
        </lineSegments>
      </group>

      {/* Allow orbiting unless the user is actively transforming an object */}
      <OrbitControls makeDefault enabled={!isTransforming} />

      {objects.map((o) => {
        const isSelected = o.id === selectedId

        const primitive = (
          <primitive
            key={o.id}
            object={o.object3d}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation()
              onSelect(o.id)
            }}
          />
        )

        // Walls and floors come from the 2D plan: selectable, but no handles.
        return isSelected && !isLocked(o.object3d) ? (
          <TransformControls
            key={o.id}
            ref={gizmoRef as never}
            object={o.object3d}
            mode={transformMode}
            rotationSnap={ROTATION_SNAP}
            // When user starts interacting with the transform, disable orbiting
            onMouseDown={(e?: THREE.Event) => {
              setIsTransforming(true)
              ;(e as unknown as { stopPropagation?: () => void })?.stopPropagation?.()
            }}
            // When mouse is released, re-enable orbiting
            onMouseUp={() => setIsTransforming(false)}
            onChange={handleTransform}
          >
            {primitive}
          </TransformControls>
        ) : (
          primitive
        )
      })}
    </>
  )
}

export default EditorCanvas
