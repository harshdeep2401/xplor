import { useEffect, useRef, useState } from 'react'
import type { TransformMode } from '../../components/Editor/EditorCanvas'
import { useKeyboardShortcuts, deleteObject } from '../../editor'
import { isLocked } from '../../editor/scene/objectMeta'
import { keepInRoom, type RoomSize } from '../../editor/scene/room'
import type { SceneObject } from '../../types/scene'
import type { SceneState } from './types'

// Arrow-key nudge in metres (Shift: bigger steps, and up/down move vertically).
const NUDGE_M = 0.05
const NUDGE_FAST_M = 0.2
// A pasted copy lands this far (metres) from the original along x and z.
const PASTE_OFFSET_M = 0.5

const TRANSFORM_KEYS: Record<string, TransformMode> = { w: 'translate', e: 'rotate', r: 'scale' }

// The 3D editor's keyboard: undo/redo, delete, copy/paste, arrow-key nudges
// (everything kept inside the room), and W/E/R for the gizmo's mode. Walls and
// floors (locked) can't be copied or moved. Returns the gizmo mode.
export function useSceneShortcuts({
  scene,
  history,
  room,
}: {
  scene: SceneState
  history: { undo: () => void; redo: () => void }
  room: RoomSize
}) {
  const clipboardRef = useRef<SceneObject | null>(null)
  // What the handles on the selected object do (W / E / R, like most 3D tools).
  const [transformMode, setTransformMode] = useState<TransformMode>('translate')

  const deleteSelected = () => {
    scene.setObjects((prev) => deleteObject(prev, scene.selectedId))
    scene.setSelectedId(null)
  }

  const copy = () => {
    const selected = scene.objects.find((obj) => obj.id === scene.selectedId)
    if (selected && !isLocked(selected.object3d)) clipboardRef.current = selected
  }

  const paste = () => {
    const source = clipboardRef.current
    if (!source) return
    const object3d = source.object3d.clone(true)
    object3d.position.x += PASTE_OFFSET_M
    object3d.position.z += PASTE_OFFSET_M
    keepInRoom(object3d, room)
    const pasted: SceneObject = {
      id: crypto.randomUUID(),
      name: source.name,
      object3d,
      animations: source.animations?.map((a) => a.clone()),
    }
    scene.setObjects((prev) => [...prev, pasted])
    scene.setSelectedId(pasted.id)
  }

  useKeyboardShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    onDelete: deleteSelected,
    onCopy: copy,
    onPaste: paste,
    onMoveObject: (direction, e) => {
      const selected = scene.objects.find((obj) => obj.id === scene.selectedId)
      if (!selected || isLocked(selected.object3d)) return
      // Move it here, once. (Mutating inside a setObjects updater would move it
      // twice under StrictMode, which runs updaters twice.)
      const step = e.shiftKey ? NUDGE_FAST_M : NUDGE_M
      const p = selected.object3d.position
      if (direction === 'up') {
        if (e.shiftKey) p.y += step
        else p.z -= step
      } else if (direction === 'down') {
        if (e.shiftKey) p.y -= step
        else p.z += step
      } else if (direction === 'left') {
        p.x -= step
      } else {
        p.x += step
      }
      keepInRoom(selected.object3d, room)
      // A new wrapper so React (and the undo history) see the change.
      scene.setObjects((prev) => prev.map((obj) => (obj === selected ? { ...obj } : obj)))
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

  return { transformMode, setTransformMode, deleteSelected }
}
