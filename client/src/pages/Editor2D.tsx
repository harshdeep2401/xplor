import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import Konva from 'konva'
import {
  AppWindow,
  BrickWall,
  CopyPlus,
  DoorOpen,
  MousePointer2,
  RulerDimensionLine,
  Scaling,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Stage,
  Layer,
  Line,
  Rect,
  Text,
  Group,
  Arc,
  Label,
  Tag,
  Shape,
  Circle,
  Image as KonvaImage,
} from 'react-konva'
import apiClient from '../services/apiClient'
import { resolveServerUrl } from '../services/serverUrl'
import { getApiErrorMessage } from '../services/errors'
import { toast } from '../components/toast/toast'
import type { ImportResult } from '../types/api'
import type {
  EditorElement,
  WallElement,
  DoorElement,
  WindowElement,
  LabelElement,
} from '../editor/canvas/elements'
import {
  toCanvasV2,
  fromCanvasV2,
  isCanvasV2,
  DEFAULT_PIXELS_PER_METRE,
  DEFAULT_WALL_HEIGHT_M,
} from '../editor/canvas/canvasV2'
import { duplicateElements, formatMetres, translateElements } from '../editor/canvas/editing'
import NumberInput from '../components/ui/NumberInput'
import '../styles/editor.css'

// Fix for trackpads interpreting tiny finger movements as drags instead of clicks
Konva.dragDistance = 5

type Tool =
  'select' | 'wall' | 'door' | 'window' | 'label' | 'delete' | 'pan' | 'measure' | 'calibrate'

// The left toolbar, top to bottom.
const TOOLS: { tool: Tool; label: string; Icon: LucideIcon; title?: string }[] = [
  {
    tool: 'select',
    label: 'Select',
    Icon: MousePointer2,
    title: 'Click to select, Shift+click to add, drag to move',
  },
  { tool: 'wall', label: 'Wall', Icon: BrickWall },
  { tool: 'door', label: 'Door', Icon: DoorOpen },
  { tool: 'window', label: 'Window', Icon: AppWindow },
  { tool: 'label', label: 'Label', Icon: TagIcon },
  { tool: 'delete', label: 'Delete', Icon: Trash2 },
  {
    tool: 'measure',
    label: 'Measure',
    Icon: RulerDimensionLine,
    title: 'Drag to measure a distance in metres',
  },
  {
    tool: 'calibrate',
    label: 'Calibrate',
    Icon: Scaling,
    title: 'Set the real-world scale from a known length',
  },
]

// Arrow-key nudge distance in metres (Shift = coarse).
const NUDGE_M = 0.05
const NUDGE_COARSE_M = 0.5
// How far a pasted copy is offset from the original, in canvas pixels.
const PASTE_OFFSET_PX = 20

interface Editor2DProject {
  name: string
  canvasWidth: number
  canvasHeight: number
  // Stored canvas is either the canvas-v2 contract or a legacy { elements: [] }
  // payload; resolved in fetchProject. Kept loose here on purpose.
  canvas: unknown
  // Canonical per-project metrics (DB columns). Used as fallback scale/height for
  // legacy canvases that don't carry their own.
  scalePixelsPerMeter?: number
  defaultWallHeightM?: number
  // Uploaded floor-plan image (Path B), shown as a trace layer under the drawing.
  floorPlanUrl?: string | null
}

// A two-point reference line drawn with the Calibrate tool, in canvas pixels.
interface CalibrationLine {
  startX: number
  startY: number
  endX: number
  endY: number
}

// Load an image for Konva. crossOrigin keeps the stage exportable (an untainted
// canvas) — the server's CORS middleware also covers /uploads.
function useTraceImage(url: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () =>
      toast.error(
        'Could not load the uploaded floor-plan image. You can still draw, but without the trace layer.',
        {
          id: 'trace-image',
        },
      )
    img.src = resolveServerUrl(url)
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [url])
  return image
}

interface SelectionBox {
  startX: number
  startY: number
  endX: number
  endY: number
}

function Editor() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [importResult, setImportResult] = useState<ImportResult | null>(
    (location.state as { importResult?: ImportResult } | null)?.importResult ?? null,
  )
  const [project, setProject] = useState<Editor2DProject | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // True after an autosave failed, so the next successful save can say so.
  const saveFailedRef = useRef(false)

  // Editor State
  const [elements, setElements] = useState<EditorElement[]>([])
  const [history, setHistory] = useState<EditorElement[][]>([])
  const [historyStep, setHistoryStep] = useState(-1)

  const [activeTool, setActiveTool] = useState<Tool>('select') // select, wall, door, window, delete, pan
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [marqueeSelectionIds, setMarqueeSelectionIds] = useState<string[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [saveStatus, setSaveStatus] = useState('Saved')

  // Project scale + wall height — the real-world metrics the canvas-v2 contract
  // needs (px→metre factor and ceiling height). Persisted with the drawing so the
  // 2D→3D converter uses real values instead of guessed defaults.
  const [pixelsPerMetre, setPixelsPerMetre] = useState(DEFAULT_PIXELS_PER_METRE)
  const [wallHeight, setWallHeight] = useState(DEFAULT_WALL_HEIGHT_M)

  // Trace layer (uploaded floor plan) + scale calibration.
  const traceImage = useTraceImage(project?.floorPlanUrl)
  const [showTrace, setShowTrace] = useState(true)
  const [traceOpacity, setTraceOpacity] = useState(0.5)
  const [calibration, setCalibration] = useState<CalibrationLine | null>(null)
  const [calibrationMetres, setCalibrationMetres] = useState('')
  // Measure tool: a temporary line, never saved.
  const [measureLine, setMeasureLine] = useState<CalibrationLine | null>(null)

  // Moving the selection with the mouse (walls, or several elements at once).
  // Single doors/windows/labels use Konva's own drag, which snaps them to walls.
  const moveRef = useRef<{
    startX: number
    startY: number
    ids: Set<string>
    base: EditorElement[]
    moved: boolean
  } | null>(null)
  // Set when a mouse move just finished, so the click that follows it doesn't
  // change the selection.
  const justMovedRef = useRef(false)
  // Copy/paste: the copied elements, and how many times they've been pasted
  // (each paste lands a little further away).
  const clipboardRef = useRef<{ elements: EditorElement[]; pastes: number } | null>(null)

  // Canvas View State
  const [stageScale, setStageScale] = useState(1)
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 })
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })

  const stageRef = useRef<Konva.Stage | null>(null)

  // Size of the canvas area (between the sidebars, under the top bar), kept up
  // to date as the window resizes. Starts with an estimate until measured.
  const [viewport, setViewport] = useState(() => ({
    width: Math.max(300, window.innerWidth - 500),
    height: Math.max(300, window.innerHeight - 60),
  }))
  const [canvasArea, setCanvasArea] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState(false)
  useEffect(() => {
    if (!canvasArea) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setViewport({ width: Math.floor(width), height: Math.floor(height) })
        setMeasured(true)
      }
    })
    observer.observe(canvasArea)
    return () => observer.disconnect()
  }, [canvasArea])
  const { width: viewportW, height: viewportH } = viewport

  // Calculate the minimum zoom scale that fits the entire canvas in the viewport
  const getMinScale = useCallback(() => {
    if (!project) return 0.1
    const scaleX = viewportW / project.canvasWidth
    const scaleY = viewportH / project.canvasHeight
    return Math.min(scaleX, scaleY) * 0.9 // 90% to leave a little padding
  }, [project, viewportW, viewportH])

  // Fit canvas to screen helper
  const fitToScreen = useCallback(() => {
    if (!project) return
    const scaleX = viewportW / project.canvasWidth
    const scaleY = viewportH / project.canvasHeight
    const fitScale = Math.min(scaleX, scaleY) * 0.9
    const offsetX = (viewportW - project.canvasWidth * fitScale) / 2
    const offsetY = (viewportH - project.canvasHeight * fitScale) / 2
    setStageScale(fitScale)
    setStagePosition({ x: offsetX, y: offsetY })
  }, [project, viewportW, viewportH])

  // Fetch Project
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const { data } = await apiClient.get<{ project: Editor2DProject }>(`/projects/${projectId}`)
        setProject(data.project)

        // The stored canvas is either the canvas-v2 contract or the legacy
        // { elements: [] } shape (older projects). Resolve both.
        const raw = data.project.canvas
        let loadedElements: EditorElement[]
        if (isCanvasV2(raw)) {
          const loaded = fromCanvasV2(raw)
          loadedElements = loaded.elements
          setPixelsPerMetre(loaded.pixelsPerMetre)
          setWallHeight(loaded.wallHeight)
        } else {
          loadedElements = (raw as { elements?: EditorElement[] } | null)?.elements || []
          // Legacy canvas carries no scale/height — fall back to the project's
          // canonical columns (or the built-in defaults).
          setPixelsPerMetre(data.project.scalePixelsPerMeter ?? DEFAULT_PIXELS_PER_METRE)
          setWallHeight(data.project.defaultWallHeightM ?? DEFAULT_WALL_HEIGHT_M)
        }
        setElements(loadedElements)
        setHistory([loadedElements])
        setHistoryStep(0)
      } catch (error) {
        const message = getApiErrorMessage(error, 'Could not open this project.')
        setLoadError(message)
        toast.error(message)
      }
    }
    void fetchProject()
  }, [projectId])

  // Fit to screen once, when the project has loaded and the canvas area has
  // been measured. Later resizes keep the user's zoom (the Fit button refits).
  const fittedRef = useRef(false)
  useEffect(() => {
    if (project && measured && !fittedRef.current) {
      fittedRef.current = true
      fitToScreen()
    }
  }, [project, measured, fitToScreen])

  // Autosave — persist as the canvas-v2 contract (walls/parametric openings +
  // real scale & wall height), not the legacy element list.
  // Returns whether the save worked. A failure shows one toast that stays until
  // a later save succeeds (autosave retries on the next edit).
  const saveProject = useCallback(
    async (newElements: EditorElement[]): Promise<boolean> => {
      setSaveStatus('Saving...')
      try {
        await apiClient.put(`/projects/${projectId}`, {
          canvas: toCanvasV2(newElements, pixelsPerMetre, wallHeight),
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

  // Save debounce. Editing scale/wallHeight also persists (they ride along in the
  // canvas-v2 payload), so they're part of the trigger.
  useEffect(() => {
    if (!project || historyStep < 0) return // skip initial render load
    const timer = setTimeout(() => {
      void saveProject(elements)
    }, 1500)
    return () => clearTimeout(timer)
  }, [elements, saveProject, project, historyStep])

  // Convert the current 2D plan → canonical 3D scene, then open the 3D editor.
  // Flush a save first so the backend converts the latest drawing (not a stale
  // debounced one).
  const handleConvertTo3D = useCallback(async () => {
    // Converting a stale drawing would silently drop the latest edits.
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

  const updateElements = useCallback(
    (newElements: EditorElement[]) => {
      setElements(newElements)
      const newHistory = history.slice(0, historyStep + 1)
      newHistory.push(newElements)
      setHistory(newHistory)
      setHistoryStep(newHistory.length - 1)
    },
    [history, historyStep],
  )

  // The current selection: one clicked element, or several (box-select or
  // Shift+click). One element lives in selectedElementId, several in
  // marqueeSelectionIds.
  const selectedIds = useMemo(
    () => (selectedElementId ? [selectedElementId] : marqueeSelectionIds),
    [selectedElementId, marqueeSelectionIds],
  )

  const setSelection = useCallback((ids: string[]) => {
    if (ids.length === 1) {
      setSelectedElementId(ids[0])
      setMarqueeSelectionIds([])
    } else {
      setSelectedElementId(null)
      setMarqueeSelectionIds(ids)
    }
  }, [])

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return
    const ids = new Set(selectedIds)
    updateElements(elements.filter((el) => !ids.has(el.id)))
    setSelection([])
  }, [elements, selectedIds, updateElements, setSelection])

  // Returns false when there's nothing to copy.
  const copySelection = useCallback(() => {
    if (selectedIds.length === 0) return false
    const ids = new Set(selectedIds)
    clipboardRef.current = { elements: elements.filter((el) => ids.has(el.id)), pastes: 0 }
    return true
  }, [elements, selectedIds])

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.elements.length === 0) return
    clip.pastes += 1
    const copies = duplicateElements(clip.elements, PASTE_OFFSET_PX * clip.pastes)
    updateElements([...elements, ...copies])
    setSelection(copies.map((c) => c.id))
  }, [elements, updateElements, setSelection])

  const duplicateSelection = useCallback(() => {
    if (copySelection()) pasteClipboard()
  }, [copySelection, pasteClipboard])

  const handleUndo = useCallback(() => {
    if (historyStep > 0) {
      setHistoryStep(historyStep - 1)
      setElements(history[historyStep - 1])
      setSelectedElementId(null)
    }
  }, [history, historyStep])

  const handleRedo = useCallback(() => {
    if (historyStep < history.length - 1) {
      setHistoryStep(historyStep + 1)
      setElements(history[historyStep + 1])
      setSelectedElementId(null)
    }
  }, [history, historyStep])

  const handleZoom = useCallback(
    (scaleBy: number) => {
      const stage = stageRef.current
      if (!stage) return
      const oldScale = stage.scaleX()
      let newScale = oldScale * scaleBy

      // Clamp: never zoom out beyond fit-to-screen, max zoom in 10x
      const minScale = getMinScale()
      newScale = Math.max(minScale, Math.min(10, newScale))
      if (Math.abs(newScale - oldScale) < 0.001) return

      // center of viewport
      const center = {
        x: stage.width() / 2,
        y: stage.height() / 2,
      }

      const mousePointTo = {
        x: (center.x - stage.x()) / oldScale,
        y: (center.y - stage.y()) / oldScale,
      }

      const newPos = {
        x: center.x - mousePointTo.x * newScale,
        y: center.y - mousePointTo.y * newScale,
      }

      setStageScale(newScale)
      setStagePosition(newPos)
    },
    [getMinScale],
  )

  const handleExport = useCallback(() => {
    if (!stageRef.current || !project) return
    const stage = stageRef.current

    // Save current state
    const oldScale = stage.scaleX()
    const oldPosition = stage.position()
    const oldSelected = selectedElementId

    // Clear selection so handles/colors don't export
    setSelectedElementId(null)

    // Reset view for export; the trace image is reference only, not part of the plan.
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })
    const trace = stage.findOne('.trace-image')
    trace?.hide()

    try {
      const dataURL = stage.toDataURL({
        x: 0,
        y: 0,
        width: project.canvasWidth,
        height: project.canvasHeight,
        pixelRatio: 2, // High resolution
      })

      const link = document.createElement('a')
      link.download = `${project.name.replace(/\s+/g, '_')}_Export.png`
      link.href = dataURL
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Exported the plan as a PNG image.')
    } catch {
      toast.error('Could not export the plan as an image.')
    } finally {
      // Restore state
      trace?.show()
      stage.scale({ x: oldScale, y: oldScale })
      stage.position(oldPosition)
      setSelectedElementId(oldSelected)
    }
  }, [project, selectedElementId])

  const handleRotate = useCallback(() => {
    if (!selectedElementId) return
    const newElements = elements.map((el) => {
      if (el.id === selectedElementId && (el.type === 'door' || el.type === 'window')) {
        return { ...el, rotation: (el.rotation || 0) + 90 }
      }
      return el
    })
    updateElements(newElements)
  }, [elements, selectedElementId, updateElements])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return // typing in a field
      const ctrl = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()

      // Escape: Deselect
      if (e.key === 'Escape') {
        setSelectedElementId(null)
        setMarqueeSelectionIds([])
        setMeasureLine(null)
        setActiveTool('select') // optionally revert to select tool
        return
      }

      // Undo: Ctrl+Z / Cmd+Z
      if (ctrl && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
      // Redo: Ctrl+Y / Cmd+Y
      else if (ctrl && key === 'y') {
        e.preventDefault()
        handleRedo()
      }
      // Copy / paste / duplicate / select all
      else if (ctrl && key === 'c') {
        if (copySelection()) {
          e.preventDefault()
          toast.info(`Copied ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}.`, {
            id: 'clipboard',
            duration: 1500,
          })
        }
      } else if (ctrl && key === 'v') {
        e.preventDefault()
        pasteClipboard()
      } else if (ctrl && key === 'd') {
        e.preventDefault()
        duplicateSelection()
      } else if (ctrl && key === 'a') {
        e.preventDefault()
        setSelection(elements.map((el) => el.id))
      }
      // Rotate: r
      else if (!ctrl && key === 'r') {
        e.preventDefault()
        handleRotate()
      }
      // Zoom: + / -
      else if (e.key === '=' || e.key === '+') {
        handleZoom(1.1)
      } else if (e.key === '-' || e.key === '_') {
        handleZoom(1 / 1.1)
      }
      // Delete: Backspace / Delete
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        deleteSelection()
      }
      // Nudge the selection with the arrow keys (Shift = bigger steps)
      else if (e.key.startsWith('Arrow') && selectedIds.length > 0) {
        e.preventDefault()
        const step = (e.shiftKey ? NUDGE_COARSE_M : NUDGE_M) * pixelsPerMetre
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        updateElements(translateElements(elements, new Set(selectedIds), dx, dy))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    handleUndo,
    handleRedo,
    handleRotate,
    handleZoom,
    elements,
    selectedIds,
    updateElements,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    deleteSelection,
    setSelection,
    pixelsPerMetre,
  ])

  const snapToWallPoints = useCallback(
    (x: number, y: number, elementsToSnap: EditorElement[], threshold = 20) => {
      let minDistance = threshold
      let snappedX = x
      let snappedY = y
      for (const el of elementsToSnap) {
        if (el.type === 'wall') {
          const d1 = Math.hypot(el.startX - x, el.startY - y)
          if (d1 < minDistance) {
            minDistance = d1
            snappedX = el.startX
            snappedY = el.startY
          }
          const d2 = Math.hypot(el.endX - x, el.endY - y)
          if (d2 < minDistance) {
            minDistance = d2
            snappedX = el.endX
            snappedY = el.endY
          }
          const midX = (el.startX + el.endX) / 2
          const midY = (el.startY + el.endY) / 2
          const d3 = Math.hypot(midX - x, midY - y)
          if (d3 < minDistance) {
            minDistance = d3
            snappedX = midX
            snappedY = midY
          }
        }
      }
      return { x: snappedX, y: snappedY }
    },
    [],
  )

  const snapToWallEdge = useCallback(
    (x: number, y: number, elementsToSnap: EditorElement[], threshold = 20) => {
      let minDistance = threshold
      let snappedX = x
      let snappedY = y
      let angle: number | null = null
      let wall: WallElement | null = null
      for (const el of elementsToSnap) {
        if (el.type === 'wall') {
          const l2 = Math.pow(el.endX - el.startX, 2) + Math.pow(el.endY - el.startY, 2)
          if (l2 === 0) continue
          let t =
            ((x - el.startX) * (el.endX - el.startX) + (y - el.startY) * (el.endY - el.startY)) / l2
          t = Math.max(0, Math.min(1, t))
          const projX = el.startX + t * (el.endX - el.startX)
          const projY = el.startY + t * (el.endY - el.startY)
          const dProj = Math.hypot(projX - x, projY - y)
          if (dProj < minDistance) {
            minDistance = dProj
            snappedX = projX
            snappedY = projY
            angle = Math.atan2(el.endY - el.startY, el.endX - el.startX) * (180 / Math.PI)
            wall = el
          }
        }
      }
      return { x: snappedX, y: snappedY, angle, wall }
    },
    [],
  )

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()

    const stage = stageRef.current
    if (!stage) return
    const oldScale = stage.scaleX()

    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const scaleBy = 1.05
    let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy

    // Clamp: never zoom out beyond fit-to-screen, max zoom in 10x
    const minScale = getMinScale()
    newScale = Math.max(minScale, Math.min(10, newScale))
    if (Math.abs(newScale - oldScale) < 0.001) return

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    }

    setStageScale(newScale)
    setStagePosition(newPos)
  }

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const scale = stage.scaleX()

    let logicalX = (pos.x - stage.x()) / scale
    let logicalY = (pos.y - stage.y()) / scale

    // Clamp to canvas boundaries
    logicalX = Math.max(0, Math.min(project?.canvasWidth || 1000, logicalX))
    logicalY = Math.max(0, Math.min(project?.canvasHeight || 1000, logicalY))

    justMovedRef.current = false

    if (activeTool === 'select') {
      const hitId = elementIdAt(e.target)
      if (!hitId) {
        // Empty canvas: start a selection box (Shift keeps the current selection).
        if (!e.evt.shiftKey) {
          setSelectedElementId(null)
          setMarqueeSelectionIds([])
        }
        setSelectionBox({ startX: logicalX, startY: logicalY, endX: logicalX, endY: logicalY })
        return
      }
      // Pressing on part of a multi-selection moves all of it; pressing on a
      // wall moves that wall. (Single doors/windows/labels drag themselves.)
      const inGroup = selectedIds.length > 1 && selectedIds.includes(hitId)
      const hit = elements.find((el) => el.id === hitId)
      if (!e.evt.shiftKey && (inGroup || hit?.type === 'wall')) {
        moveRef.current = {
          startX: logicalX,
          startY: logicalY,
          ids: new Set(inGroup ? selectedIds : [hitId]),
          base: elements,
          moved: false,
        }
      }
      return
    }

    if (activeTool === 'measure') {
      setIsDrawing(true)
      const snap = snapToWallPoints(logicalX, logicalY, elements)
      setMeasureLine({ startX: snap.x, startY: snap.y, endX: snap.x, endY: snap.y })
      return
    }

    if (activeTool === 'calibrate') {
      setIsDrawing(true)
      const snap = snapToWallPoints(logicalX, logicalY, elements)
      setCalibration({ startX: snap.x, startY: snap.y, endX: snap.x, endY: snap.y })
      return
    }

    if (activeTool === 'wall') {
      setIsDrawing(true)
      const snap = snapToWallPoints(logicalX, logicalY, elements)
      const newWall: WallElement = {
        id: `wall_${Date.now()}`,
        type: 'wall',
        startX: snap.x,
        startY: snap.y,
        endX: snap.x,
        endY: snap.y,
        thickness: 30,
      }
      const newElements = [...elements, newWall]
      setElements(newElements)
    } else if (activeTool === 'door') {
      const snap = snapToWallEdge(logicalX, logicalY, elements)
      const newDoor: DoorElement = {
        id: `door_${Date.now()}`,
        type: 'door',
        x: snap.x,
        y: snap.y,
        width: 120,
        height: 4,
        rotation: snap.angle !== null ? snap.angle : 0,
      }
      updateElements([...elements, newDoor])
    } else if (activeTool === 'window') {
      setIsDrawing(true)
      const snap = snapToWallEdge(logicalX, logicalY, elements)
      let curvature = 0
      if (snap.wall && snap.wall.curvature) {
        const wallLen =
          Math.hypot(snap.wall.endX - snap.wall.startX, snap.wall.endY - snap.wall.startY) || 1
        curvature = snap.wall.curvature * Math.pow(1 / wallLen, 2)
      }
      const newWindow: WindowElement = {
        id: `window_${Date.now()}`,
        type: 'window',
        x: snap.x,
        y: snap.y,
        startX: snap.x,
        startY: snap.y,
        width: 1, // Will increase on drag
        height: 30,
        rotation: snap.angle !== null ? snap.angle : 0,
        curvature: curvature,
        attachedWallId: snap.wall ? snap.wall.id : null,
      }
      setElements([...elements, newWindow])
    } else if (activeTool === 'label') {
      const newLabel: LabelElement = {
        id: `label_${Date.now()}`,
        type: 'label',
        x: logicalX,
        y: logicalY,
        text: 'Room Name',
        fontSize: 24,
      }
      updateElements([...elements, newLabel])
    }
  }

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = e.target.getStage()
    if (!stage || !project) return
    const pos = stage.getPointerPosition()
    if (!pos) return
    const scale = stage.scaleX()

    let logicalX = (pos.x - stage.x()) / scale
    let logicalY = (pos.y - stage.y()) / scale

    // Clamp to canvas boundaries
    logicalX = Math.max(0, Math.min(project.canvasWidth, logicalX))
    logicalY = Math.max(0, Math.min(project.canvasHeight, logicalY))

    // Update cursor pos for display
    setCursorPos({ x: Math.round(logicalX), y: Math.round(logicalY) })

    if (selectionBox) {
      setSelectionBox({ ...selectionBox, endX: logicalX, endY: logicalY })
      return
    }

    const move = moveRef.current
    if (move && (e.evt.buttons & 1) === 0) {
      // The button was released outside the canvas: finish the move here.
      moveRef.current = null
      if (move.moved) updateElements(elements)
      return
    }
    if (move) {
      const dx = logicalX - move.startX
      const dy = logicalY - move.startY
      // Ignore tiny jitters of a plain click (same threshold as Konva's drags).
      if (!move.moved && Math.hypot(dx, dy) * scale < Konva.dragDistance) return
      move.moved = true
      setElements(translateElements(move.base, move.ids, dx, dy))
      return
    }

    if (isDrawing && activeTool === 'measure') {
      setMeasureLine((prev) => {
        if (!prev) return prev
        let { x: endX, y: endY } = snapToWallPoints(logicalX, logicalY, elements)
        // Shift: straight horizontal or vertical.
        if (e.evt.shiftKey) {
          if (Math.abs(endX - prev.startX) < Math.abs(endY - prev.startY)) endX = prev.startX
          else endY = prev.startY
        }
        return { ...prev, endX, endY }
      })
      return
    }

    if (isDrawing && activeTool === 'calibrate') {
      const snap = snapToWallPoints(logicalX, logicalY, elements)
      setCalibration((prev) => (prev ? { ...prev, endX: snap.x, endY: snap.y } : prev))
      return
    }

    if (!isDrawing || (activeTool !== 'wall' && activeTool !== 'window')) return

    if (activeTool === 'window') {
      setElements((prevElements) => {
        const newElements = [...prevElements]
        const lastWindow = { ...newElements[newElements.length - 1] } as WindowElement

        const snap = snapToWallEdge(logicalX, logicalY, prevElements.slice(0, -1))
        const endX = snap.x
        const endY = snap.y

        const dx = endX - lastWindow.startX
        const dy = endY - lastWindow.startY
        const width = Math.max(10, Math.hypot(dx, dy))

        lastWindow.x = (lastWindow.startX + endX) / 2
        lastWindow.y = (lastWindow.startY + endY) / 2
        lastWindow.width = width
        if (snap.angle !== null) {
          lastWindow.rotation = snap.angle
        }
        if (snap.wall && snap.wall.curvature) {
          const wallLen =
            Math.hypot(snap.wall.endX - snap.wall.startX, snap.wall.endY - snap.wall.startY) || 1
          lastWindow.curvature = snap.wall.curvature * Math.pow(width / wallLen, 2)
          lastWindow.attachedWallId = snap.wall.id
        } else {
          lastWindow.curvature = 0
          lastWindow.attachedWallId = null
        }

        newElements[newElements.length - 1] = lastWindow
        return newElements
      })
      return
    }

    setElements((prevElements) => {
      const newElements = [...prevElements]
      const lastElement = { ...newElements[newElements.length - 1] } as WallElement
      let endX = logicalX
      let endY = logicalY

      // Auto-snap to 90 degrees if close (within ~11 degrees) or if Shift is pressed
      const dx = Math.abs(endX - lastElement.startX)
      const dy = Math.abs(endY - lastElement.startY)

      if (e.evt.shiftKey || dx < dy * 0.2 || dy < dx * 0.2) {
        if (dx < dy) {
          endX = lastElement.startX // Snap to vertical
        } else {
          endY = lastElement.startY // Snap to horizontal
        }
      }

      // Also snap to other wall endpoints and midpoints
      const snap = snapToWallPoints(endX, endY, prevElements.slice(0, -1))
      if (snap.x !== endX || snap.y !== endY) {
        endX = snap.x
        endY = snap.y
      }

      lastElement.endX = endX
      lastElement.endY = endY
      newElements[newElements.length - 1] = lastElement
      return newElements
    })
  }

  const handleMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const move = moveRef.current
    if (move) {
      moveRef.current = null
      if (move.moved) {
        updateElements(elements) // one undo step for the whole move
        justMovedRef.current = true
      }
      return
    }

    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX)
      const maxX = Math.max(selectionBox.startX, selectionBox.endX)
      const minY = Math.min(selectionBox.startY, selectionBox.endY)
      const maxY = Math.max(selectionBox.startY, selectionBox.endY)

      // Select elements inside box
      const selected = elements
        .filter((el) => {
          if (el.type === 'wall') {
            return (
              (el.startX >= minX && el.startX <= maxX && el.startY >= minY && el.startY <= maxY) ||
              (el.endX >= minX && el.endX <= maxX && el.endY >= minY && el.endY <= maxY)
            )
          } else {
            return el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY
          }
        })
        .map((el) => el.id)

      // Shift adds the boxed elements to what was already selected.
      setSelection(e.evt.shiftKey ? [...new Set([...selectedIds, ...selected])] : selected)
      setSelectionBox(null)
      return
    }

    if (isDrawing && (activeTool === 'wall' || activeTool === 'window')) {
      updateElements(elements) // save history at end of draw
    }
    setIsDrawing(false)
  }

  const calibrationPx = calibration
    ? Math.hypot(calibration.endX - calibration.startX, calibration.endY - calibration.startY)
    : 0
  const measurePx = measureLine
    ? Math.hypot(measureLine.endX - measureLine.startX, measureLine.endY - measureLine.startY)
    : 0
  const calibrationValue = Number(calibrationMetres)
  const canApplyCalibration = calibrationPx >= 1 && calibrationValue > 0

  const clearCalibration = () => {
    setCalibration(null)
    setCalibrationMetres('')
  }

  // Scale = measured pixels / real metres. Changing pixelsPerMetre triggers the
  // canvas-v2 autosave, so the new scale is persisted with the drawing.
  const applyCalibration = () => {
    if (!canApplyCalibration) return
    setPixelsPerMetre(Math.round((calibrationPx / calibrationValue) * 100) / 100)
    clearCalibration()
    setActiveTool('select')
  }

  const selectTool = (tool: Tool) => {
    if (tool !== 'calibrate') clearCalibration()
    if (tool !== 'measure') setMeasureLine(null)
    setActiveTool(tool)
  }

  // Which element (if any) a Konva node belongs to: each element's top-level
  // group/shape carries the element id as its Konva id.
  const elementIdAt = (node: Konva.Node | null): string | null => {
    const ids = new Set(elements.map((el) => el.id))
    while (node && node.getType() !== 'Stage') {
      const id = node.id()
      if (id && ids.has(id)) return id
      node = node.getParent()
    }
    return null
  }

  // additive (Shift+click): add/remove the element to/from the selection.
  const handleElementClick = (id: string, additive = false) => {
    if (justMovedRef.current) {
      // The click that ends a drag-move: keep the selection as it is.
      justMovedRef.current = false
      return
    }
    if (activeTool === 'delete') {
      updateElements(elements.filter((el) => el.id !== id))
    } else if (additive) {
      setSelection(
        selectedIds.includes(id) ? selectedIds.filter((s) => s !== id) : [...selectedIds, id],
      )
    } else {
      setSelection([id])
    }
  }

  // Element is part of a multi-selection (moved as a group, not dragged alone).
  const inMultiSelection = (id: string) =>
    marqueeSelectionIds.length > 1 && marqueeSelectionIds.includes(id)

  if (loadError) {
    return (
      <div className="editor-loading">
        <p>{loadError}</p>
        <button className="topbar-btn" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    )
  }
  if (!project) return <div className="editor-loading">Loading Project...</div>

  const selectedElement = elements.find((el) => el.id === selectedElementId)

  return (
    <div className="editor-container">
      {/* Top Bar */}
      <div className="editor-topbar">
        <div className="topbar-left">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>
            &larr;
          </button>
          <div className="project-title">{project.name}</div>
        </div>
        <div className="topbar-center">
          <div className="save-status">{saveStatus}</div>
        </div>
        <div className="topbar-right">
          {/* Project scale + wall height → persisted into the canvas-v2 contract. */}
          <label className="scale-field" title="Canvas pixels per real-world metre">
            px/m
            <input
              type="number"
              min={1}
              step={1}
              value={pixelsPerMetre}
              onChange={(e) => setPixelsPerMetre(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <label className="scale-field" title="Wall height in metres (3D extrusion)">
            wall h (m)
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={wallHeight}
              onChange={(e) => setWallHeight(Math.max(0.1, Number(e.target.value) || 0.1))}
            />
          </label>
          {project.floorPlanUrl && (
            <div className="trace-controls" title="Uploaded floor plan shown under the drawing">
              <label className="trace-toggle">
                <input
                  type="checkbox"
                  checked={showTrace}
                  onChange={(e) => setShowTrace(e.target.checked)}
                />
                Trace
              </label>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={traceOpacity}
                disabled={!showTrace}
                onChange={(e) => setTraceOpacity(Number(e.target.value))}
                aria-label="Trace image opacity"
              />
            </div>
          )}
          <button className="topbar-btn" onClick={handleUndo} disabled={historyStep <= 0}>
            Undo
          </button>
          <button
            className="topbar-btn"
            onClick={handleRedo}
            disabled={historyStep >= history.length - 1}
          >
            Redo
          </button>
          <button className="topbar-btn" onClick={() => handleZoom(1.2)}>
            Zoom In
          </button>
          <button className="topbar-btn" onClick={() => handleZoom(1 / 1.2)}>
            Zoom Out
          </button>
          <button className="topbar-btn" onClick={fitToScreen}>
            Fit
          </button>
          <span className="zoom-label">{Math.round(stageScale * 100)}%</span>
          <button className="topbar-btn export-btn" onClick={handleExport}>
            Export
          </button>
          <button className="topbar-btn export-btn" onClick={handleConvertTo3D}>
            Convert to 3D
          </button>
        </div>
      </div>

      {importResult && (
        <div
          className={`import-banner ${importResult.status === 'failed' ? 'import-banner-error' : ''}`}
        >
          <span>
            {importResult.status === 'completed'
              ? `Detected ${importResult.wallCount} wall${importResult.wallCount === 1 ? '' : 's'} from your floor plan. Fix any mistakes against the trace image, add doors and windows, then use Calibrate to set the real-world scale.`
              : `Wall detection failed (${importResult.error}). Your image is loaded as a trace layer, so you can draw over it.`}
          </span>
          <button
            className="import-banner-close"
            onClick={() => setImportResult(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <div className="editor-main">
        {/* Left Sidebar - Tools */}
        <div className="editor-sidebar left-sidebar">
          {TOOLS.map(({ tool, label, Icon, title }) => (
            <button
              key={tool}
              className={`tool-btn ${activeTool === tool ? 'active' : ''}`}
              onClick={() => selectTool(tool)}
              title={title}
              aria-pressed={activeTool === tool}
            >
              <Icon size={16} aria-hidden="true" /> {label}
            </button>
          ))}
        </div>

        {/* Center Canvas */}
        <div className="editor-canvas-wrapper" ref={setCanvasArea}>
          <Stage
            width={viewportW}
            height={viewportH}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onDblClick={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'canvas-board') {
                setActiveTool('select')
                setSelectedElementId(null)
              }
            }}
            onDblTap={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'canvas-board') {
                setActiveTool('select')
                setSelectedElementId(null)
              }
            }}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePosition.x}
            y={stagePosition.y}
            ref={stageRef}
            className="konva-stage"
          >
            <Layer>
              {/* Canvas Board — the user's actual drawing area */}
              <Rect
                name="canvas-board"
                x={0}
                y={0}
                width={project.canvasWidth}
                height={project.canvasHeight}
                fill="#ffffff"
                shadowColor="rgba(0,0,0,0.4)"
                shadowBlur={40}
                shadowOffsetX={0}
                shadowOffsetY={4}
                shadowOpacity={0.5}
              />

              {/* Grid lines inside canvas */}
              {(() => {
                const gridLines = []
                const gridSize = 50
                for (let x = gridSize; x < project.canvasWidth; x += gridSize) {
                  gridLines.push(
                    <Line
                      key={`gv_${x}`}
                      points={[x, 0, x, project.canvasHeight]}
                      stroke={x % 200 === 0 ? '#d4d4d8' : '#e5e7eb'}
                      strokeWidth={x % 200 === 0 ? 0.5 : 0.3}
                    />,
                  )
                }
                for (let y = gridSize; y < project.canvasHeight; y += gridSize) {
                  gridLines.push(
                    <Line
                      key={`gh_${y}`}
                      points={[0, y, project.canvasWidth, y]}
                      stroke={y % 200 === 0 ? '#d4d4d8' : '#e5e7eb'}
                      strokeWidth={y % 200 === 0 ? 0.5 : 0.3}
                    />,
                  )
                }
                return gridLines
              })()}

              {/* Uploaded floor plan, 1:1 with canvas pixels (reference only) */}
              {traceImage && (
                <KonvaImage
                  name="trace-image"
                  image={traceImage}
                  x={0}
                  y={0}
                  width={traceImage.naturalWidth}
                  height={traceImage.naturalHeight}
                  opacity={traceOpacity}
                  visible={showTrace}
                  listening={false}
                />
              )}

              {/* Canvas border */}
              <Rect
                x={0}
                y={0}
                width={project.canvasWidth}
                height={project.canvasHeight}
                stroke="#94a3b8"
                strokeWidth={2}
                listening={false}
              />

              {/* Dimension labels */}
              <Text
                x={project.canvasWidth / 2 - 40}
                y={-22}
                text={formatMetres(project.canvasWidth, pixelsPerMetre, 1)}
                fontSize={12}
                fill="#64748b"
                fontFamily="monospace"
              />
              <Text
                x={-45}
                y={project.canvasHeight / 2 - 6}
                text={formatMetres(project.canvasHeight, pixelsPerMetre, 1)}
                fontSize={12}
                fill="#64748b"
                fontFamily="monospace"
                rotation={-90}
              />

              {/* Drawing elements — Multi-Pass Rendering for Architectural Styling */}

              {/* Pass 1: Wall Outlines (Thick Dark) */}
              {elements
                .filter((el) => el.type === 'wall')
                .map((el) => {
                  const dx = el.endX - el.startX
                  const dy = el.endY - el.startY
                  const len = Math.sqrt(dx * dx + dy * dy)
                  const t = el.thickness || 30
                  const curvature = el.curvature || 0
                  const isCurved = curvature !== 0
                  let points = [el.startX, el.startY, el.endX, el.endY]
                  if (isCurved) {
                    const nx = -dy / Math.max(1, len)
                    const ny = dx / Math.max(1, len)
                    points = [
                      el.startX,
                      el.startY,
                      (el.startX + el.endX) / 2 + nx * curvature,
                      (el.startY + el.endY) / 2 + ny * curvature,
                      el.endX,
                      el.endY,
                    ]
                  }
                  const isSelected =
                    selectedElementId === el.id || marqueeSelectionIds.includes(el.id)

                  return (
                    <Line
                      key={`outline_${el.id}`}
                      points={points}
                      tension={isCurved ? 0.5 : 0}
                      stroke={isSelected ? '#14b8a6' : '#1e293b'}
                      strokeWidth={t + 2}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                    />
                  )
                })}

              {/* Pass 2: Wall Fills (Light inner core) */}
              {elements
                .filter((el) => el.type === 'wall')
                .map((el) => {
                  const dx = el.endX - el.startX
                  const dy = el.endY - el.startY
                  const len = Math.sqrt(dx * dx + dy * dy)
                  const angle = Math.atan2(dy, dx) * (180 / Math.PI)
                  const t = el.thickness || 30
                  const curvature = el.curvature || 0
                  const isCurved = curvature !== 0
                  let midX = (el.startX + el.endX) / 2
                  let midY = (el.startY + el.endY) / 2
                  let points = [el.startX, el.startY, el.endX, el.endY]

                  if (isCurved) {
                    const nx = -dy / Math.max(1, len)
                    const ny = dx / Math.max(1, len)
                    midX += nx * curvature
                    midY += ny * curvature
                    points = [el.startX, el.startY, midX, midY, el.endX, el.endY]
                  }
                  const isSelected =
                    selectedElementId === el.id || marqueeSelectionIds.includes(el.id)
                  const isActiveDrawing =
                    isDrawing && elements.length > 0 && elements[elements.length - 1]?.id === el.id

                  return (
                    <Group key={`fill_${el.id}`} id={el.id}>
                      <Line
                        points={points}
                        tension={isCurved ? 0.5 : 0}
                        stroke={isSelected ? '#ccfbf1' : '#f8fafc'}
                        strokeWidth={t - 2}
                        lineCap="round"
                        lineJoin="round"
                        onClick={(e) => handleElementClick(el.id, e.evt.shiftKey)}
                        onTap={() => handleElementClick(el.id)}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                        onDblTap={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                      />

                      {/* Dimension Text */}
                      {(isSelected || isActiveDrawing) && len > 0 && (
                        <Label
                          x={midX}
                          y={midY}
                          rotation={angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle}
                          offsetY={t / 2 + 15}
                        >
                          <Tag
                            fill="#14b8a6"
                            cornerRadius={4}
                            pointerDirection="down"
                            pointerWidth={10}
                            pointerHeight={10}
                          />
                          <Text
                            text={formatMetres(len, pixelsPerMetre)}
                            fill="white"
                            padding={6}
                            fontSize={16}
                            fontStyle="bold"
                            fontFamily="monospace"
                          />
                        </Label>
                      )}
                    </Group>
                  )
                })}

              {/* Pass 3: Doors, Windows, and Room Labels */}
              {elements
                .filter((el) => el.type !== 'wall')
                .map((el) => {
                  const isSelected =
                    selectedElementId === el.id || marqueeSelectionIds.includes(el.id)
                  const selColor = '#14b8a6'

                  {
                    /* ── LABEL ── Room Text Label */
                  }
                  if (el.type === 'label') {
                    return (
                      <Group
                        key={el.id}
                        id={el.id}
                        x={el.x}
                        y={el.y}
                        draggable={activeTool === 'select' && !inMultiSelection(el.id)}
                        onDragEnd={(e) => {
                          const newElements = elements.map((item) =>
                            item.id === el.id
                              ? { ...item, x: e.target.x(), y: e.target.y() }
                              : item,
                          )
                          updateElements(newElements)
                        }}
                        onClick={(e) => handleElementClick(el.id, e.evt.shiftKey)}
                        onTap={() => handleElementClick(el.id)}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                        onDblTap={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                      >
                        <Rect
                          x={-100}
                          y={-20}
                          width={200}
                          height={40}
                          fill={isSelected ? '#e0f2fe' : 'transparent'}
                          cornerRadius={4}
                        />
                        <Text
                          x={-100}
                          y={-12}
                          width={200}
                          text={el.text || 'Room'}
                          fontSize={el.fontSize || 24}
                          fill={isSelected ? selColor : '#475569'}
                          align="center"
                          fontStyle={isSelected ? 'bold' : 'normal'}
                        />
                      </Group>
                    )
                  }

                  {
                    /* ── DOOR ── door leaf line + quarter-circle swing arc */
                  }
                  if (el.type === 'door') {
                    const w = el.width || 120
                    const strokeCol = isSelected ? selColor : '#94a3b8' // Grey door
                    return (
                      <Group
                        key={el.id}
                        id={el.id}
                        x={el.x}
                        y={el.y}
                        rotation={el.rotation || 0}
                        draggable={activeTool === 'select' && !inMultiSelection(el.id)}
                        onDragMove={(e) => {
                          let newX = e.target.x()
                          let newY = e.target.y()
                          newX = Math.max(0, Math.min(project.canvasWidth, newX))
                          newY = Math.max(0, Math.min(project.canvasHeight, newY))

                          const snap = snapToWallEdge(newX, newY, elements)
                          if (snap.angle !== null) {
                            e.target.rotation(snap.angle)
                          }

                          e.target.x(snap.x)
                          e.target.y(snap.y)
                        }}
                        onDragEnd={(e) => {
                          const snap = snapToWallEdge(e.target.x(), e.target.y(), elements)
                          const newRotation = snap.angle !== null ? snap.angle : e.target.rotation()

                          const newElements = elements.map((item) =>
                            item.id === el.id
                              ? { ...item, x: snap.x, y: snap.y, rotation: newRotation }
                              : item,
                          )
                          updateElements(newElements)
                        }}
                        onClick={(e) => handleElementClick(el.id, e.evt.shiftKey)}
                        onTap={() => handleElementClick(el.id)}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                        onDblTap={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                      >
                        {/* Invisible hit area — makes the door easy to click */}
                        <Rect x={-4} y={-w - 4} width={w + 8} height={w + 8} fill="transparent" />
                        {/* White mask to cover the wall behind the door opening */}
                        <Rect
                          x={0}
                          y={-16}
                          width={w}
                          height={32}
                          fill="#ffffff"
                          listening={false}
                        />
                        {/* Door leaf (the actual door panel — open at 90 degrees) */}
                        <Rect
                          x={-4}
                          y={-w}
                          width={8}
                          height={w}
                          fill={strokeCol}
                          cornerRadius={2}
                        />
                        {/* Quarter-circle arc showing swing direction */}
                        <Arc
                          x={0}
                          y={0}
                          innerRadius={w - 2}
                          outerRadius={w}
                          angle={90}
                          rotation={-90}
                          fill={strokeCol}
                          stroke={strokeCol}
                          strokeWidth={1.5}
                          dash={[6, 4]}
                        />
                        {/* Hinge dot */}
                        <Rect
                          x={-5}
                          y={-5}
                          width={10}
                          height={10}
                          fill={strokeCol}
                          cornerRadius={5}
                          listening={false}
                        />
                        {/* Wall break lines at door edges */}
                        <Line
                          points={[0, -18, 0, 18]}
                          stroke={strokeCol}
                          strokeWidth={2}
                          listening={false}
                        />
                        <Line
                          points={[w, -18, w, 18]}
                          stroke={strokeCol}
                          strokeWidth={2}
                          listening={false}
                        />
                      </Group>
                    )
                  }

                  {
                    /* ── WINDOW ── curved or straight outer rectangle + internal parallel lines */
                  }
                  if (el.type === 'window') {
                    const w = el.width || 120
                    const h = el.height || 10
                    const strokeCol = isSelected ? selColor : '#1e293b'
                    const curvature = el.curvature || 0
                    const isCurved = curvature !== 0

                    return (
                      <Group
                        key={el.id}
                        id={el.id}
                        x={el.x}
                        y={el.y}
                        offsetX={w / 2}
                        offsetY={h / 2}
                        rotation={el.rotation || 0}
                        draggable={activeTool === 'select' && !inMultiSelection(el.id)}
                        onDragMove={(e) => {
                          let newX = e.target.x()
                          let newY = e.target.y()
                          newX = Math.max(0, Math.min(project.canvasWidth, newX))
                          newY = Math.max(0, Math.min(project.canvasHeight, newY))

                          const snap = snapToWallEdge(newX, newY, elements)
                          if (snap.angle !== null) {
                            e.target.rotation(snap.angle)
                          }

                          e.target.x(snap.x)
                          e.target.y(snap.y)
                        }}
                        onDragEnd={(e) => {
                          const snap = snapToWallEdge(e.target.x(), e.target.y(), elements)
                          const newRotation = snap.angle !== null ? snap.angle : e.target.rotation()
                          let newCurvature = 0
                          if (snap.wall && snap.wall.curvature) {
                            const wallLen =
                              Math.hypot(
                                snap.wall.endX - snap.wall.startX,
                                snap.wall.endY - snap.wall.startY,
                              ) || 1
                            newCurvature = snap.wall.curvature * Math.pow(w / wallLen, 2)
                          }

                          const newElements = elements.map((item) =>
                            item.id === el.id
                              ? {
                                  ...item,
                                  x: snap.x,
                                  y: snap.y,
                                  rotation: newRotation,
                                  curvature: newCurvature,
                                  attachedWallId: snap.wall ? snap.wall.id : null,
                                }
                              : item,
                          )
                          updateElements(newElements)
                        }}
                        onClick={(e) => handleElementClick(el.id, e.evt.shiftKey)}
                        onTap={() => handleElementClick(el.id)}
                        onDblClick={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                        onDblTap={(e) => {
                          e.cancelBubble = true
                          handleElementClick(el.id)
                        }}
                      >
                        {/* Outer wall-thickness border */}
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            ctx.beginPath()
                            ctx.moveTo(0, 0)
                            if (isCurved) ctx.quadraticCurveTo(w / 2, curvature * 2, w, 0)
                            else ctx.lineTo(w, 0)
                            ctx.lineTo(w, h)
                            if (isCurved) ctx.quadraticCurveTo(w / 2, h + curvature * 2, 0, h)
                            else ctx.lineTo(0, h)
                            ctx.closePath()
                            ctx.fillStrokeShape(shape)
                          }}
                          fill="#ffffff"
                          stroke={strokeCol}
                          strokeWidth={2}
                        />
                        {/* Center line (glass pane) */}
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            ctx.beginPath()
                            ctx.moveTo(0, h / 2)
                            if (isCurved)
                              ctx.quadraticCurveTo(w / 2, h / 2 + curvature * 2, w, h / 2)
                            else ctx.lineTo(w, h / 2)
                            ctx.strokeShape(shape)
                          }}
                          stroke={strokeCol}
                          strokeWidth={1}
                          listening={false}
                        />
                        {/* Top inner line */}
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            ctx.beginPath()
                            ctx.moveTo(0, h * 0.2)
                            if (isCurved)
                              ctx.quadraticCurveTo(w / 2, h * 0.2 + curvature * 2, w, h * 0.2)
                            else ctx.lineTo(w, h * 0.2)
                            ctx.strokeShape(shape)
                          }}
                          stroke={strokeCol}
                          strokeWidth={0.5}
                          opacity={0.5}
                          listening={false}
                        />
                        {/* Bottom inner line */}
                        <Shape
                          sceneFunc={(ctx, shape) => {
                            ctx.beginPath()
                            ctx.moveTo(0, h * 0.8)
                            if (isCurved)
                              ctx.quadraticCurveTo(w / 2, h * 0.8 + curvature * 2, w, h * 0.8)
                            else ctx.lineTo(w, h * 0.8)
                            ctx.strokeShape(shape)
                          }}
                          stroke={strokeCol}
                          strokeWidth={0.5}
                          opacity={0.5}
                          listening={false}
                        />
                      </Group>
                    )
                  }
                  return null
                })}

              {/* Calibration reference line */}
              {calibration && activeTool === 'calibrate' && (
                <Group listening={false}>
                  <Line
                    points={[
                      calibration.startX,
                      calibration.startY,
                      calibration.endX,
                      calibration.endY,
                    ]}
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dash={[10, 6]}
                  />
                  <Circle x={calibration.startX} y={calibration.startY} radius={6} fill="#f59e0b" />
                  <Circle x={calibration.endX} y={calibration.endY} radius={6} fill="#f59e0b" />
                  <Label
                    x={(calibration.startX + calibration.endX) / 2}
                    y={(calibration.startY + calibration.endY) / 2 - 30}
                  >
                    <Tag fill="#f59e0b" cornerRadius={4} />
                    <Text
                      text={`${Math.round(calibrationPx)} px`}
                      fontSize={14}
                      padding={4}
                      fill="#ffffff"
                    />
                  </Label>
                </Group>
              )}

              {/* Measure tool line */}
              {measureLine && activeTool === 'measure' && (
                <Group listening={false}>
                  <Line
                    points={[
                      measureLine.startX,
                      measureLine.startY,
                      measureLine.endX,
                      measureLine.endY,
                    ]}
                    stroke="#14b8a6"
                    strokeWidth={3 / stageScale}
                    dash={[10 / stageScale, 6 / stageScale]}
                  />
                  <Circle
                    x={measureLine.startX}
                    y={measureLine.startY}
                    radius={5 / stageScale}
                    fill="#14b8a6"
                  />
                  <Circle
                    x={measureLine.endX}
                    y={measureLine.endY}
                    radius={5 / stageScale}
                    fill="#14b8a6"
                  />
                  <Label
                    x={(measureLine.startX + measureLine.endX) / 2}
                    y={(measureLine.startY + measureLine.endY) / 2}
                    scaleX={1 / stageScale}
                    scaleY={1 / stageScale}
                    offsetY={28}
                  >
                    <Tag fill="#14b8a6" cornerRadius={4} />
                    <Text
                      text={formatMetres(measurePx, pixelsPerMetre)}
                      fontSize={14}
                      padding={5}
                      fill="#ffffff"
                      fontStyle="bold"
                    />
                  </Label>
                </Group>
              )}

              {/* Marquee Selection Box */}
              {selectionBox && (
                <Rect
                  x={Math.min(selectionBox.startX, selectionBox.endX)}
                  y={Math.min(selectionBox.startY, selectionBox.endY)}
                  width={Math.abs(selectionBox.endX - selectionBox.startX)}
                  height={Math.abs(selectionBox.endY - selectionBox.startY)}
                  fill="rgba(20, 184, 166, 0.2)"
                  stroke="#14b8a6"
                  strokeWidth={1}
                  listening={false}
                />
              )}
            </Layer>
          </Stage>
        </div>

        {/* Right Sidebar - Properties */}
        <div className="editor-sidebar right-sidebar">
          <h3>
            {activeTool === 'calibrate'
              ? 'Calibrate Scale'
              : activeTool === 'measure'
                ? 'Measure'
                : selectedIds.length > 1
                  ? 'Selection'
                  : 'Properties'}
          </h3>
          {activeTool === 'measure' ? (
            <div className="properties-panel">
              <p className="calibrate-help">
                Drag across the plan to measure a distance. Hold Shift for a straight line.
                Measurements aren't saved.
              </p>
              <div className="prop-row">
                <span>Distance</span>
                <span>{measurePx >= 1 ? formatMetres(measurePx, pixelsPerMetre) : '—'}</span>
              </div>
              <p className="calibrate-help">
                Based on the scale {pixelsPerMetre} px/m. If it looks wrong, set the scale with
                Calibrate first.
              </p>
            </div>
          ) : activeTool === 'calibrate' ? (
            <div className="properties-panel">
              <p className="calibrate-help">
                Drag along something whose real length you know (e.g. a wall with a dimension on the
                plan), then enter that length.
              </p>
              <div className="prop-row">
                <span>Measured</span>
                <span>{calibrationPx >= 1 ? `${Math.round(calibrationPx)} px` : '—'}</span>
              </div>
              <div className="prop-row">
                <label>Real length (m)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={calibrationMetres}
                  disabled={calibrationPx < 1}
                  onChange={(e) => setCalibrationMetres(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyCalibration()
                  }}
                />
              </div>
              {canApplyCalibration && (
                <div className="prop-row">
                  <span>New scale</span>
                  <span>{(calibrationPx / calibrationValue).toFixed(2)} px/m</span>
                </div>
              )}
              <button
                className="topbar-btn export-btn calibrate-apply"
                onClick={applyCalibration}
                disabled={!canApplyCalibration}
              >
                Apply scale
              </button>
              <div className="prop-row">
                <span>Current scale</span>
                <span>{pixelsPerMetre} px/m</span>
              </div>
            </div>
          ) : selectedIds.length > 1 ? (
            <div className="properties-panel">
              <div className="prop-row">
                <span>Selected</span>
                <span>{selectedIds.length} items</span>
              </div>
              <button className="topbar-btn sidebar-action" onClick={duplicateSelection}>
                <CopyPlus size={14} aria-hidden="true" /> Duplicate (Ctrl+D)
              </button>
              <button className="topbar-btn sidebar-action" onClick={deleteSelection}>
                <Trash2 size={14} aria-hidden="true" /> Delete (Del)
              </button>
              <p className="calibrate-help">
                Drag any selected item to move them all. Arrow keys nudge by 5 cm (Shift: 50 cm).
                Ctrl+C / Ctrl+V copy and paste. Shift+click adds or removes an item.
              </p>
            </div>
          ) : selectedElement ? (
            <div className="properties-panel">
              <div className="prop-row">
                <span>Type:</span>
                <span className="capitalize">{selectedElement.type}</span>
              </div>
              {selectedElement.type === 'wall' && (
                <>
                  <div className="prop-row">
                    <label>Length (m)</label>
                    <NumberInput
                      min={0.01}
                      step={0.05}
                      value={
                        Math.hypot(
                          selectedElement.endX - selectedElement.startX,
                          selectedElement.endY - selectedElement.startY,
                        ) / pixelsPerMetre
                      }
                      onChange={(metres) => {
                        const newLen = Math.max(1, metres * pixelsPerMetre)
                        const dx = selectedElement.endX - selectedElement.startX
                        const dy = selectedElement.endY - selectedElement.startY
                        const currLen = Math.hypot(dx, dy)
                        const ratio = newLen / Math.max(1, currLen)
                        const newEndX = selectedElement.startX + dx * ratio
                        const newEndY = selectedElement.startY + dy * ratio
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, endX: newEndX, endY: newEndY }
                              : el,
                          ),
                        )
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Thickness (m)</label>
                    <NumberInput
                      min={0.01}
                      step={0.01}
                      value={selectedElement.thickness / pixelsPerMetre}
                      onChange={(metres) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, thickness: metres * pixelsPerMetre }
                              : el,
                          ),
                        )
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Curvature</label>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      value={selectedElement.curvature || 0}
                      onChange={(e) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, curvature: Number(e.target.value) }
                              : el,
                          ),
                        )
                      }}
                    />
                  </div>
                </>
              )}
              {(selectedElement.type === 'door' || selectedElement.type === 'window') && (
                <>
                  <div className="prop-row">
                    <label>Width (m)</label>
                    <NumberInput
                      min={0.01}
                      step={0.05}
                      value={selectedElement.width / pixelsPerMetre}
                      onChange={(metres) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, width: metres * pixelsPerMetre }
                              : el,
                          ),
                        )
                      }}
                    />
                  </div>
                  {selectedElement.type === 'window' && (
                    <div className="prop-row">
                      <label>Drawn thickness (m)</label>
                      <NumberInput
                        min={0.01}
                        step={0.01}
                        value={selectedElement.height / pixelsPerMetre}
                        onChange={(metres) => {
                          updateElements(
                            elements.map((el) =>
                              el.id === selectedElement.id
                                ? { ...el, height: metres * pixelsPerMetre }
                                : el,
                            ),
                          )
                        }}
                      />
                    </div>
                  )}
                  <div className="prop-row">
                    <label>Rotation</label>
                    <input
                      type="number"
                      value={selectedElement.rotation || 0}
                      onChange={(e) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, rotation: Number(e.target.value) }
                              : el,
                          ),
                        )
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>
                      Hint: Press 'R' to rotate 90°
                    </span>
                  </div>
                </>
              )}
              {selectedElement.type === 'label' && (
                <>
                  <div className="prop-row">
                    <label>Room Name</label>
                    <input
                      type="text"
                      value={selectedElement.text || ''}
                      onChange={(e) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id ? { ...el, text: e.target.value } : el,
                          ),
                        )
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Font Size</label>
                    <input
                      type="number"
                      value={selectedElement.fontSize || 24}
                      onChange={(e) => {
                        updateElements(
                          elements.map((el) =>
                            el.id === selectedElement.id
                              ? { ...el, fontSize: Number(e.target.value) }
                              : el,
                          ),
                        )
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="no-selection">Select an object to view properties</div>
              <ul className="shortcut-list" aria-label="Keyboard shortcuts">
                <li>
                  <kbd>Shift</kbd>+click or drag a box: select several
                </li>
                <li>Drag a selected item: move</li>
                <li>
                  <kbd>↑↓←→</kbd> nudge 5 cm (<kbd>Shift</kbd>: 50 cm)
                </li>
                <li>
                  <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> copy, paste
                </li>
                <li>
                  <kbd>Ctrl</kbd>+<kbd>D</kbd> duplicate
                </li>
                <li>
                  <kbd>Ctrl</kbd>+<kbd>A</kbd> select all
                </li>
                <li>
                  <kbd>R</kbd> rotate a door or window
                </li>
                <li>
                  <kbd>Del</kbd> delete, <kbd>Esc</kbd> deselect
                </li>
              </ul>
            </>
          )}
        </div>
      </div>

      {/* Coordinates Display (metres from the canvas's top-left corner) */}
      <div className="coords-display">
        <span>X: {formatMetres(cursorPos.x, pixelsPerMetre)}</span>
        <span className="coords-sep">|</span>
        <span>Y: {formatMetres(cursorPos.y, pixelsPerMetre)}</span>
      </div>
    </div>
  )
}

export default Editor
