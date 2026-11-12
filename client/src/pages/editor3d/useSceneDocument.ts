import { useCallback, useEffect, useRef, useState } from 'react'
import apiClient from '../../services/apiClient'
import { getApiErrorCode, getApiErrorMessage } from '../../services/errors'
import { activeSceneResponse, parseResponse, type SavedScene } from '../../services/apiSchemas'
import { toast } from '../../components/toast/toast'
import {
  objectsToSceneV1,
  sceneV1ToObjects,
  planOffset,
  isSceneV1,
  type SceneV1,
} from '../../editor'
import { planBoundsFromSceneV1 } from '../../editor/scene/buildFromSceneV1'
import { fitGrid, type RoomSize } from '../../editor/scene/room'
import type { SceneState } from './types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// The project's canonical 3D scene (scene-v1): loading it into the editor and
// saving the editor back into it, plus the room (grid) it sits in.
//
// The editor shows the plan centred on the origin; scene-v1 positions are
// absolute plan coordinates. `offset` is the plan centre that separates them
// (editor = absolute − offset; see editor/persist/sceneV1).
export function useSceneDocument(
  projectId: string | undefined,
  initialRoom: RoomSize,
  scene: SceneState,
) {
  const [projectName, setProjectName] = useState('Untitled')
  const [room, setRoom] = useState(initialRoom)
  const [isLoading, setIsLoading] = useState(Boolean(projectId))
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  // Bumped when a scene is loaded so the canvas frames the camera around it once.
  const [frameKey, setFrameKey] = useState(0)
  // Version of the active Scene we loaded, for optimistic saves (stale → 409).
  const [sceneVersion, setSceneVersion] = useState(0)
  // The scene-v1 we loaded: walls, rooms and wall materials are saved back as-is.
  const baseSceneRef = useRef<SceneV1 | null>(null)
  const offsetRef = useRef({ x: 0, z: 0 })

  // The editor's objects as a scene-v1, right now (unsaved edits included).
  const { objectsRef } = scene
  const currentScene = useCallback(
    () => objectsToSceneV1(baseSceneRef.current, objectsRef.current, offsetRef.current),
    [objectsRef],
  )

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
        // furniture, lights and colours added here. SCENE_NOT_FOUND → nothing yet.
        let saved: SavedScene | null = null
        try {
          const { data } = await apiClient.get<unknown>(`/projects/${projectId}/scene`)
          saved = parseResponse(activeSceneResponse, data, '3D scene').scene
        } catch (e) {
          if (getApiErrorCode(e) !== 'SCENE_NOT_FOUND') throw e
        }
        if (cancelled) return
        setSceneVersion(saved?.version ?? 0)
        const sd = saved?.sceneData
        const grid = saved?.metadata?.grid

        if (isSceneV1(sd)) {
          const offset = planOffset(sd)
          baseSceneRef.current = sd
          offsetRef.current = offset
          const { objects, failed } = await sceneV1ToObjects(sd, offset)
          if (cancelled) return
          scene.setObjects(objects)
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
              width: fitGrid(bounds.width),
              length: fitGrid(bounds.length),
              height: bounds.height,
            })
          } else if (grid) {
            setRoom({
              width: grid.width ?? 10,
              length: grid.length ?? 10,
              height: grid.height ?? 2.8,
            })
          }
          if (objects.length) setFrameKey((k) => k + 1)
        } else if (sd) {
          toast.info(
            "This 3D scene was saved in an older format that can't be opened any more. Convert the 2D plan again, or start adding objects — saving replaces the old version.",
            { duration: 0 },
          )
        }
      } catch (e) {
        if (!cancelled) toast.error(getApiErrorMessage(e, 'Could not open this 3D project.'))
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
    // Loads once per project; `scene` is stable for the page's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  // Save the editor's objects into the canonical scene-v1 and the grid size.
  // Optimistic: sends the loaded version; a stale save (re-converted or edited
  // elsewhere) is refused with SCENE_VERSION_CONFLICT.
  const save = useCallback(async () => {
    if (!projectId) return
    setSaveStatus('saving')
    try {
      const { scene: sceneData, skipped } = currentScene()
      const { data } = await apiClient.put(`/projects/${projectId}/scene`, {
        sceneData,
        metadata: { grid: { width: room.width, length: room.length, height: room.height } },
        baseVersion: sceneVersion,
      })
      baseSceneRef.current = sceneData
      if (data?.scene?.version) setSceneVersion(data.scene.version)
      setSaveStatus('saved')
      if (skipped.length) {
        toast.info(`Saved, except: ${skipped.join(', ')} (no file to reload it from).`)
      }

      // Store a GLB snapshot of the saved scene (best effort; the server keeps
      // only the newest few). Failure here must not fail the save.
      try {
        const { buildGlbBlob } = await import('../../editor/export/exportGLB')
        const blob = await buildGlbBlob(objectsRef.current)
        const form = new FormData()
        form.append('glb', blob, 'scene.glb')
        await apiClient.post(`/projects/${projectId}/glb`, form)
      } catch {
        toast.info('Saved. The downloadable GLB copy could not be updated this time.')
      }
    } catch (e) {
      if (getApiErrorCode(e) === 'SCENE_VERSION_CONFLICT') {
        toast.error(
          'Not saved: this scene was changed elsewhere (e.g. converted again from 2D). Reload the page to get the latest version.',
          { duration: 0 },
        )
      } else {
        toast.error(getApiErrorMessage(e, 'Your scene could not be saved. Please try again.'))
      }
      setSaveStatus('error')
    }
  }, [projectId, room, sceneVersion, currentScene, objectsRef])

  return {
    projectName,
    room,
    isLoading,
    saveStatus,
    frameKey,
    offsetRef,
    currentScene,
    save,
  }
}
