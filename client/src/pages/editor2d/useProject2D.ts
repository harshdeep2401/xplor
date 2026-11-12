import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import apiClient from '../../services/apiClient'
import { getApiErrorMessage } from '../../services/errors'
import { toast } from '../../components/toast/toast'
import type { EditorElement } from '../../editor/canvas/elements'
import {
  toCanvasV2,
  fromCanvasV2,
  isCanvasV2,
  DEFAULT_PIXELS_PER_METRE,
  DEFAULT_WALL_HEIGHT_M,
} from '../../editor/canvas/canvasV2'
import type { ElementHistory } from './useElementHistory'
import type { Editor2DProject } from './types'

// Autosave waits this long after the last edit.
const AUTOSAVE_DELAY_MS = 1500

// The project behind the 2D editor: loading it, the real-world scale and wall
// height, autosave (as the canvas-v2 contract), and converting to 3D.
export function useProject2D(
  projectId: string | undefined,
  { elements, reset, loaded }: Pick<ElementHistory, 'elements' | 'reset' | 'loaded'>,
) {
  const navigate = useNavigate()
  const [project, setProject] = useState<Editor2DProject | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState('Saved')
  // True after an autosave failed, so the next successful save can say so.
  const saveFailedRef = useRef(false)

  // Project scale + wall height — the real-world metrics the canvas-v2 contract
  // needs (px→metre factor and ceiling height). Persisted with the drawing so the
  // 2D→3D converter uses real values instead of guessed defaults.
  const [pixelsPerMetre, setPixelsPerMetre] = useState(DEFAULT_PIXELS_PER_METRE)
  const [wallHeight, setWallHeight] = useState(DEFAULT_WALL_HEIGHT_M)

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await apiClient.get<{ project: Editor2DProject }>(`/projects/${projectId}`)
        setProject(data.project)

        // The stored canvas is either the canvas-v2 contract or the legacy
        // { elements: [] } shape (older projects). Resolve both.
        const raw = data.project.canvas
        let loadedElements: EditorElement[]
        if (isCanvasV2(raw)) {
          const canvas = fromCanvasV2(raw)
          loadedElements = canvas.elements
          setPixelsPerMetre(canvas.pixelsPerMetre)
          setWallHeight(canvas.wallHeight)
        } else {
          loadedElements = (raw as { elements?: EditorElement[] } | null)?.elements || []
          // Legacy canvas carries no scale/height — fall back to the project's
          // canonical columns (or the built-in defaults).
          setPixelsPerMetre(data.project.scalePixelsPerMeter ?? DEFAULT_PIXELS_PER_METRE)
          setWallHeight(data.project.defaultWallHeightM ?? DEFAULT_WALL_HEIGHT_M)
        }
        reset(loadedElements)
      } catch (error) {
        const message = getApiErrorMessage(error, 'Could not open this project.')
        setLoadError(message)
        toast.error(message)
      }
    }
    void load()
  }, [projectId, reset])

  // Save the drawing as canvas-v2 (walls, parametric openings, real scale and
  // wall height). Returns whether it worked. A failure shows one toast that
  // stays until a later save succeeds (autosave retries on the next edit).
  const saveProject = useCallback(
    async (toSave: EditorElement[]): Promise<boolean> => {
      setSaveStatus('Saving...')
      try {
        await apiClient.put(`/projects/${projectId}`, {
          canvas: toCanvasV2(toSave, pixelsPerMetre, wallHeight),
        })
        setSaveStatus('Saved')
        if (saveFailedRef.current) {
          saveFailedRef.current = false
          toast.success('Saved. Your changes are safe again.', { id: 'autosave' })
        }
        return true
      } catch (error) {
        setSaveStatus('Error saving')
        saveFailedRef.current = true
        toast.error(
          `${getApiErrorMessage(error, 'Your changes could not be saved.')} Keep this tab open; saving is retried on your next edit.`,
          { id: 'autosave', duration: 0 },
        )
        return false
      }
    },
    [projectId, pixelsPerMetre, wallHeight],
  )

  // Autosave after edits. Editing scale/wallHeight also persists (they ride
  // along in the canvas-v2 payload), so they're part of the trigger.
  useEffect(() => {
    if (!project || !loaded) return // nothing to save before the first load
    const timer = setTimeout(() => {
      void saveProject(elements)
    }, AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [elements, saveProject, project, loaded])

  // Convert the current 2D plan → canonical 3D scene, then open the 3D editor.
  // Save first, so the backend converts the latest drawing, not a stale one.
  const convertTo3D = useCallback(async () => {
    if (!(await saveProject(elements))) return
    setSaveStatus('Converting…')
    try {
      await apiClient.post(`/projects/${projectId}/convert`)
      navigate(`/editor/3d/${projectId}`)
    } catch (error) {
      setSaveStatus('Convert failed')
      toast.error(getApiErrorMessage(error, 'Could not convert the plan to 3D. Please try again.'))
    }
  }, [projectId, elements, saveProject, navigate])

  return {
    project,
    loadError,
    saveStatus,
    pixelsPerMetre,
    setPixelsPerMetre,
    wallHeight,
    setWallHeight,
    convertTo3D,
  }
}
