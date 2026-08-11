import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Konva from 'konva'
import { Stage, Layer, Line, Rect, Text, Group, Arc, Label, Tag, Shape } from 'react-konva'
import '../styles/editor.css'

// Fix for trackpads interpreting tiny finger movements as drags instead of clicks
Konva.dragDistance = 5;

type Tool = 'select' | 'wall' | 'door' | 'window' | 'label' | 'delete' | 'pan'

interface WallElement {
  id: string
  type: 'wall'
  startX: number
  startY: number
  endX: number
  endY: number
  thickness: number
  curvature?: number
}
interface DoorElement {
  id: string
  type: 'door'
  x: number
  y: number
  width: number
  height: number
  rotation: number
}
interface WindowElement {
  id: string
  type: 'window'
  x: number
  y: number
  startX: number
  startY: number
  width: number
  height: number
  rotation: number
  curvature: number
  attachedWallId: string | null
}
interface LabelElement {
  id: string
  type: 'label'
  x: number
  y: number
  text: string
  fontSize: number
}
type EditorElement = WallElement | DoorElement | WindowElement | LabelElement

interface Editor2DProject {
  name: string
  canvasWidth: number
  canvasHeight: number
  canvas: { elements?: EditorElement[] }
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
  const [project, setProject] = useState<Editor2DProject | null>(null)

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

  // Canvas View State
  const [stageScale, setStageScale] = useState(1)
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 })
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })

  const stageRef = useRef<Konva.Stage | null>(null)

  // Calculate the minimum zoom scale that fits the entire canvas in the viewport
  const getMinScale = useCallback(() => {
    const viewportW = window.innerWidth - 500
    const viewportH = window.innerHeight - 60
    if (!project) return 0.1
    const scaleX = viewportW / project.canvasWidth
    const scaleY = viewportH / project.canvasHeight
    return Math.min(scaleX, scaleY) * 0.9 // 90% to leave a little padding
  }, [project])

  // Fit canvas to screen helper
  const fitToScreen = useCallback(() => {
    if (!project) return
    const viewportW = window.innerWidth - 500
    const viewportH = window.innerHeight - 60
    const scaleX = viewportW / project.canvasWidth
    const scaleY = viewportH / project.canvasHeight
    const fitScale = Math.min(scaleX, scaleY) * 0.9
    const offsetX = (viewportW - project.canvasWidth * fitScale) / 2
    const offsetY = (viewportH - project.canvasHeight * fitScale) / 2
    setStageScale(fitScale)
    setStagePosition({ x: offsetX, y: offsetY })
  }, [project])

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && (e.target as HTMLElement).tagName !== 'INPUT') {
        if (selectedElementId) {
          updateElements(elements.filter(el => el.id !== selectedElementId));
          setSelectedElementId(null);
        } else if (marqueeSelectionIds.length > 0) {
          updateElements(elements.filter(el => !marqueeSelectionIds.includes(el.id)));
          setMarqueeSelectionIds([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [elements, selectedElementId, marqueeSelectionIds]);

  // Fetch Project
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const token = localStorage.getItem('token')
        const response = await fetch(`http://localhost:5001/api/projects/${projectId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await response.json()
        if (response.ok) {
          setProject(data.project)
          const loadedElements = data.project.canvas.elements || []
          setElements(loadedElements)
          setHistory([loadedElements])
          setHistoryStep(0)
        } else {
          console.error('Failed to load project')
        }
      } catch (error) {
        console.error('Error fetching project:', error)
      }
    }
    fetchProject()
  }, [projectId])

  // Fit to screen once project loads
  useEffect(() => {
    if (project) {
      fitToScreen()
    }
  }, [project, fitToScreen])

  // Autosave
  const saveProject = useCallback(async (newElements: EditorElement[]) => {
    setSaveStatus('Saving...')
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`http://localhost:5001/api/projects/${projectId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ canvas: { elements: newElements } })
      })
      if (response.ok) {
        setSaveStatus('Saved')
      } else {
        setSaveStatus('Error saving')
      }
    } catch (error) {
      setSaveStatus('Error saving')
    }
  }, [projectId])

  // Save debounce
  useEffect(() => {
    if (!project || historyStep < 0) return // skip initial render load
    const timer = setTimeout(() => {
      saveProject(elements)
    }, 1500)
    return () => clearTimeout(timer)
  }, [elements, saveProject, project])

  const updateElements = useCallback((newElements: EditorElement[]) => {
    setElements(newElements)
    const newHistory = history.slice(0, historyStep + 1)
    newHistory.push(newElements)
    setHistory(newHistory)
    setHistoryStep(newHistory.length - 1)
  }, [history, historyStep])

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

  const handleZoom = useCallback((scaleBy: number) => {
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
  }, [getMinScale])

  const handleExport = useCallback(() => {
    if (!stageRef.current || !project) return
    const stage = stageRef.current
    
    // Save current state
    const oldScale = stage.scaleX()
    const oldPosition = stage.position()
    const oldSelected = selectedElementId
    
    // Clear selection so handles/colors don't export
    setSelectedElementId(null)
    
    // Reset view for export
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })
    
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
    } finally {
      // Restore state
      stage.scale({ x: oldScale, y: oldScale })
      stage.position(oldPosition)
      setSelectedElementId(oldSelected)
    }
  }, [project, selectedElementId])

  const handleRotate = useCallback(() => {
    if (!selectedElementId) return
    const newElements = elements.map(el => {
      if (el.id === selectedElementId && (el.type === 'door' || el.type === 'window')) {
        return { ...el, rotation: (el.rotation || 0) + 90 }
      }
      return el
    })
    updateElements(newElements)
  }, [elements, selectedElementId, updateElements])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return // ignore when typing in inputs

      // Escape: Deselect
      if (e.key === 'Escape') {
        setSelectedElementId(null)
        setMarqueeSelectionIds([])
        setActiveTool('select') // optionally revert to select tool
        return
      }

      // Undo: Ctrl+Z / Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      }
      // Redo: Ctrl+Y / Cmd+Y
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
      }
      // Rotate: r
      else if (e.key.toLowerCase() === 'r') {
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
        if (selectedElementId) {
          updateElements(elements.filter(el => el.id !== selectedElementId))
          setSelectedElementId(null)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo, handleRotate, handleZoom, elements, selectedElementId, updateElements])

  const snapToWallPoints = useCallback((x: number, y: number, elementsToSnap: EditorElement[], threshold = 20) => {
    let minDistance = threshold;
    let snappedX = x;
    let snappedY = y;
    for (const el of elementsToSnap) {
      if (el.type === 'wall') {
        const d1 = Math.hypot(el.startX - x, el.startY - y);
        if (d1 < minDistance) { minDistance = d1; snappedX = el.startX; snappedY = el.startY; }
        const d2 = Math.hypot(el.endX - x, el.endY - y);
        if (d2 < minDistance) { minDistance = d2; snappedX = el.endX; snappedY = el.endY; }
        const midX = (el.startX + el.endX) / 2;
        const midY = (el.startY + el.endY) / 2;
        const d3 = Math.hypot(midX - x, midY - y);
        if (d3 < minDistance) { minDistance = d3; snappedX = midX; snappedY = midY; }
      }
    }
    return { x: snappedX, y: snappedY };
  }, []);

  const snapToWallEdge = useCallback((x: number, y: number, elementsToSnap: EditorElement[], threshold = 20) => {
    let minDistance = threshold;
    let snappedX = x;
    let snappedY = y;
    let angle: number | null = null;
    let wall: WallElement | null = null;
    for (const el of elementsToSnap) {
      if (el.type === 'wall') {
        const l2 = Math.pow(el.endX - el.startX, 2) + Math.pow(el.endY - el.startY, 2);
        if (l2 === 0) continue;
        let t = ((x - el.startX) * (el.endX - el.startX) + (y - el.startY) * (el.endY - el.startY)) / l2;
        t = Math.max(0, Math.min(1, t));
        const projX = el.startX + t * (el.endX - el.startX);
        const projY = el.startY + t * (el.endY - el.startY);
        const dProj = Math.hypot(projX - x, projY - y);
        if (dProj < minDistance) {
          minDistance = dProj;
          snappedX = projX;
          snappedY = projY;
          angle = Math.atan2(el.endY - el.startY, el.endX - el.startX) * (180 / Math.PI);
          wall = el;
        }
      }
    }
    return { x: snappedX, y: snappedY, angle, wall };
  }, []);

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

    if (activeTool === 'select') {
      const clickedOnEmpty = e.target === e.target.getStage() || e.target.name() === 'canvas-board'
      if (clickedOnEmpty) {
        setSelectedElementId(null)
        setMarqueeSelectionIds([])
        setSelectionBox({ startX: logicalX, startY: logicalY, endX: logicalX, endY: logicalY })
      }
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
        thickness: 30
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
        rotation: snap.angle !== null ? snap.angle : 0
      }
      updateElements([...elements, newDoor])
    } else if (activeTool === 'window') {
      setIsDrawing(true)
      const snap = snapToWallEdge(logicalX, logicalY, elements)
      let curvature = 0
      if (snap.wall && snap.wall.curvature) {
        const wallLen = Math.hypot(snap.wall.endX - snap.wall.startX, snap.wall.endY - snap.wall.startY) || 1
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
        attachedWallId: snap.wall ? snap.wall.id : null
      }
      setElements([...elements, newWindow])
    } else if (activeTool === 'label') {
      const newLabel: LabelElement = {
        id: `label_${Date.now()}`,
        type: 'label',
        x: logicalX,
        y: logicalY,
        text: 'Room Name',
        fontSize: 24
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

    if (!isDrawing || (activeTool !== 'wall' && activeTool !== 'window')) return

    if (activeTool === 'window') {
      setElements(prevElements => {
        const newElements = [...prevElements]
        const lastWindow = { ...newElements[newElements.length - 1] } as WindowElement

        const snap = snapToWallEdge(logicalX, logicalY, prevElements.slice(0, -1));
        const endX = snap.x;
        const endY = snap.y;

        const dx = endX - lastWindow.startX;
        const dy = endY - lastWindow.startY;
        const width = Math.max(10, Math.hypot(dx, dy));
        
        lastWindow.x = (lastWindow.startX + endX) / 2;
        lastWindow.y = (lastWindow.startY + endY) / 2;
        lastWindow.width = width;
        if (snap.angle !== null) {
          lastWindow.rotation = snap.angle;
        }
        if (snap.wall && snap.wall.curvature) {
          const wallLen = Math.hypot(snap.wall.endX - snap.wall.startX, snap.wall.endY - snap.wall.startY) || 1
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

    setElements(prevElements => {
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
      const snap = snapToWallPoints(endX, endY, prevElements.slice(0, -1));
      if (snap.x !== endX || snap.y !== endY) {
        endX = snap.x;
        endY = snap.y;
      }

      lastElement.endX = endX
      lastElement.endY = endY
      newElements[newElements.length - 1] = lastElement
      return newElements
    })
  }

  const handleMouseUp = () => {
    if (selectionBox) {
      const minX = Math.min(selectionBox.startX, selectionBox.endX);
      const maxX = Math.max(selectionBox.startX, selectionBox.endX);
      const minY = Math.min(selectionBox.startY, selectionBox.endY);
      const maxY = Math.max(selectionBox.startY, selectionBox.endY);
      
      // Select elements inside box
      const selected = elements.filter(el => {
        if (el.type === 'wall') {
           return (el.startX >= minX && el.startX <= maxX && el.startY >= minY && el.startY <= maxY) || 
                  (el.endX >= minX && el.endX <= maxX && el.endY >= minY && el.endY <= maxY);
        } else {
           return el.x >= minX && el.x <= maxX && el.y >= minY && el.y <= maxY;
        }
      }).map(el => el.id);
      
      if (selected.length > 0) {
        setMarqueeSelectionIds(selected);
        setSelectedElementId(null);
      } else {
        setMarqueeSelectionIds([]);
      }
      setSelectionBox(null);
      return;
    }

    if (isDrawing && (activeTool === 'wall' || activeTool === 'window')) {
      updateElements(elements) // save history at end of draw
    }
    setIsDrawing(false)
  }

  const handleElementClick = (id: string) => {
    if (activeTool === 'delete') {
      updateElements(elements.filter(el => el.id !== id))
    } else {
      setSelectedElementId(id)
      setMarqueeSelectionIds([])
    }
  }

  if (!project) return <div className="editor-loading">Loading Project...</div>

  const selectedElement = elements.find(el => el.id === selectedElementId)

  return (
    <div className="editor-container">
      {/* Top Bar */}
      <div className="editor-topbar">
        <div className="topbar-left">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>&larr;</button>
          <div className="project-title">{project.name}</div>
        </div>
        <div className="topbar-center">
          <div className="save-status">{saveStatus}</div>
        </div>
        <div className="topbar-right">
          <button className="topbar-btn" onClick={handleUndo} disabled={historyStep <= 0}>Undo</button>
          <button className="topbar-btn" onClick={handleRedo} disabled={historyStep >= history.length - 1}>Redo</button>
          <button className="topbar-btn" onClick={() => handleZoom(1.2)}>Zoom In</button>
          <button className="topbar-btn" onClick={() => handleZoom(1 / 1.2)}>Zoom Out</button>
          <button className="topbar-btn" onClick={fitToScreen}>Fit</button>
          <span className="zoom-label">{Math.round(stageScale * 100)}%</span>
          <button className="topbar-btn export-btn" onClick={handleExport}>Export</button>
        </div>
      </div>

      <div className="editor-main">
        {/* Left Sidebar - Tools */}
        <div className="editor-sidebar left-sidebar">
          <button className={`tool-btn ${activeTool === 'select' ? 'active' : ''}`} onClick={() => setActiveTool('select')}>🖱 Select</button>
          <button className={`tool-btn ${activeTool === 'wall' ? 'active' : ''}`} onClick={() => setActiveTool('wall')}>🧱 Wall</button>
          <button className={`tool-btn ${activeTool === 'door' ? 'active' : ''}`} onClick={() => setActiveTool('door')}>🚪 Door</button>
          <button className={`tool-btn ${activeTool === 'window' ? 'active' : ''}`} onClick={() => setActiveTool('window')}>🪟 Window</button>
          <button className={`tool-btn ${activeTool === 'label' ? 'active' : ''}`} onClick={() => setActiveTool('label')}>🏷 Label</button>
          <button className={`tool-btn ${activeTool === 'delete' ? 'active' : ''}`} onClick={() => setActiveTool('delete')}>🗑 Delete</button>
        </div>

        {/* Center Canvas */}
        <div className="editor-canvas-wrapper">
          <Stage
            width={window.innerWidth - 500}
            height={window.innerHeight - 60}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onWheel={handleWheel}
            onDblClick={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'canvas-board') {
                setActiveTool('select');
                setSelectedElementId(null);
              }
            }}
            onDblTap={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'canvas-board') {
                setActiveTool('select');
                setSelectedElementId(null);
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
                    />
                  )
                }
                for (let y = gridSize; y < project.canvasHeight; y += gridSize) {
                  gridLines.push(
                    <Line
                      key={`gh_${y}`}
                      points={[0, y, project.canvasWidth, y]}
                      stroke={y % 200 === 0 ? '#d4d4d8' : '#e5e7eb'}
                      strokeWidth={y % 200 === 0 ? 0.5 : 0.3}
                    />
                  )
                }
                return gridLines
              })()}

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
                text={`${project.canvasWidth}px`}
                fontSize={12}
                fill="#64748b"
                fontFamily="monospace"
              />
              <Text
                x={-45}
                y={project.canvasHeight / 2 - 6}
                text={`${project.canvasHeight}px`}
                fontSize={12}
                fill="#64748b"
                fontFamily="monospace"
                rotation={-90}
              />

              {/* Drawing elements — Multi-Pass Rendering for Architectural Styling */}
              
              {/* Pass 1: Wall Outlines (Thick Dark) */}
              {elements.filter(el => el.type === 'wall').map(el => {
                const dx = el.endX - el.startX;
                const dy = el.endY - el.startY;
                const len = Math.sqrt(dx * dx + dy * dy);
                const t = el.thickness || 30;
                const curvature = el.curvature || 0;
                let isCurved = curvature !== 0;
                let points = [el.startX, el.startY, el.endX, el.endY];
                if (isCurved) {
                   const nx = -dy / Math.max(1, len);
                   const ny = dx / Math.max(1, len);
                   points = [el.startX, el.startY, (el.startX+el.endX)/2 + nx*curvature, (el.startY+el.endY)/2 + ny*curvature, el.endX, el.endY];
                }
                const isSelected = selectedElementId === el.id || marqueeSelectionIds.includes(el.id);
                
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
                );
              })}

              {/* Pass 2: Wall Fills (Light inner core) */}
              {elements.filter(el => el.type === 'wall').map(el => {
                const dx = el.endX - el.startX;
                const dy = el.endY - el.startY;
                const len = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                const t = el.thickness || 30;
                const curvature = el.curvature || 0;
                let isCurved = curvature !== 0;
                let midX = (el.startX + el.endX) / 2;
                let midY = (el.startY + el.endY) / 2;
                let points = [el.startX, el.startY, el.endX, el.endY];
                
                if (isCurved) {
                   const nx = -dy / Math.max(1, len);
                   const ny = dx / Math.max(1, len);
                   midX += nx * curvature;
                   midY += ny * curvature;
                   points = [el.startX, el.startY, midX, midY, el.endX, el.endY];
                }
                const isSelected = selectedElementId === el.id || marqueeSelectionIds.includes(el.id);
                const isActiveDrawing = isDrawing && elements.length > 0 && elements[elements.length - 1]?.id === el.id;

                return (
                  <Group key={`fill_${el.id}`}>
                    <Line
                      points={points}
                      tension={isCurved ? 0.5 : 0}
                      stroke={isSelected ? '#ccfbf1' : '#f8fafc'}
                      strokeWidth={t - 2}
                      lineCap="round"
                      lineJoin="round"
                      onClick={() => handleElementClick(el.id)}
                      onTap={() => handleElementClick(el.id)}
                      onDblClick={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                      onDblTap={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                    />
                    
                    {/* Dimension Text */}
                    {(isSelected || isActiveDrawing) && len > 0 && (
                      <Label
                        x={midX}
                        y={midY}
                        rotation={angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle}
                        offsetY={t / 2 + 15}
                      >
                        <Tag fill="#14b8a6" cornerRadius={4} pointerDirection="down" pointerWidth={10} pointerHeight={10} />
                        <Text text={`${Math.round(len)} px`} fill="white" padding={6} fontSize={16} fontStyle="bold" fontFamily="monospace" />
                      </Label>
                    )}
                  </Group>
                );
              })}

              {/* Pass 3: Doors, Windows, and Room Labels */}
              {elements.filter(el => el.type !== 'wall').map(el => {
                const isSelected = selectedElementId === el.id || marqueeSelectionIds.includes(el.id);
                const selColor = '#14b8a6';


                {/* ── LABEL ── Room Text Label */ }
                if (el.type === 'label') {
                  return (
                    <Group
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      draggable={activeTool === 'select'}
                      onDragEnd={(e) => {
                        const newElements = elements.map(item => item.id === el.id ? { ...item, x: e.target.x(), y: e.target.y() } : item)
                        updateElements(newElements)
                      }}
                      onClick={() => handleElementClick(el.id)}
                      onTap={() => handleElementClick(el.id)}
                      onDblClick={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                      onDblTap={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
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

                {/* ── DOOR ── door leaf line + quarter-circle swing arc */ }
                if (el.type === 'door') {
                  const w = el.width || 120
                  const strokeCol = isSelected ? selColor : '#94a3b8' // Grey door
                  return (
                    <Group
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      rotation={el.rotation || 0}
                      draggable={activeTool === 'select'}
                      onDragMove={(e) => {
                        let newX = e.target.x()
                        let newY = e.target.y()
                        newX = Math.max(0, Math.min(project.canvasWidth, newX))
                        newY = Math.max(0, Math.min(project.canvasHeight, newY))
                        
                        const snap = snapToWallEdge(newX, newY, elements);
                        if (snap.angle !== null) {
                          e.target.rotation(snap.angle);
                        }
                        
                        e.target.x(snap.x)
                        e.target.y(snap.y)
                      }}
                      onDragEnd={(e) => {
                        const snap = snapToWallEdge(e.target.x(), e.target.y(), elements);
                        const newRotation = snap.angle !== null ? snap.angle : e.target.rotation();
                        
                        const newElements = elements.map(item => item.id === el.id ? { ...item, x: snap.x, y: snap.y, rotation: newRotation } : item)
                        updateElements(newElements)
                      }}
                      onClick={() => handleElementClick(el.id)}
                      onTap={() => handleElementClick(el.id)}
                      onDblClick={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                      onDblTap={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                    >
                      {/* Invisible hit area — makes the door easy to click */}
                      <Rect
                        x={-4}
                        y={-w - 4}
                        width={w + 8}
                        height={w + 8}
                        fill="transparent"
                      />
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

                {/* ── WINDOW ── curved or straight outer rectangle + internal parallel lines */ }
                if (el.type === 'window') {
                  const w = el.width || 120
                  const h = el.height || 10
                  const strokeCol = isSelected ? selColor : '#1e293b'
                  const curvature = el.curvature || 0
                  const isCurved = curvature !== 0
                  
                  return (
                    <Group
                      key={el.id}
                      x={el.x}
                      y={el.y}
                      offsetX={w / 2}
                      offsetY={h / 2}
                      rotation={el.rotation || 0}
                      draggable={activeTool === 'select'}
                      onDragMove={(e) => {
                        let newX = e.target.x()
                        let newY = e.target.y()
                        newX = Math.max(0, Math.min(project.canvasWidth, newX))
                        newY = Math.max(0, Math.min(project.canvasHeight, newY))
                        
                        const snap = snapToWallEdge(newX, newY, elements);
                        if (snap.angle !== null) {
                          e.target.rotation(snap.angle);
                        }
                        
                        e.target.x(snap.x)
                        e.target.y(snap.y)
                      }}
                      onDragEnd={(e) => {
                        const snap = snapToWallEdge(e.target.x(), e.target.y(), elements);
                        const newRotation = snap.angle !== null ? snap.angle : e.target.rotation();
                        let newCurvature = 0;
                        if (snap.wall && snap.wall.curvature) {
                          const wallLen = Math.hypot(snap.wall.endX - snap.wall.startX, snap.wall.endY - snap.wall.startY) || 1
                          newCurvature = snap.wall.curvature * Math.pow(w / wallLen, 2)
                        }
                        
                        const newElements = elements.map(item => item.id === el.id ? { ...item, x: snap.x, y: snap.y, rotation: newRotation, curvature: newCurvature, attachedWallId: snap.wall ? snap.wall.id : null } : item)
                        updateElements(newElements)
                      }}
                      onClick={() => handleElementClick(el.id)}
                      onTap={() => handleElementClick(el.id)}
                      onDblClick={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                      onDblTap={(e) => { e.cancelBubble = true; handleElementClick(el.id); }}
                    >
                      {/* Outer wall-thickness border */}
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          ctx.beginPath();
                          ctx.moveTo(0, 0);
                          if (isCurved) ctx.quadraticCurveTo(w / 2, curvature * 2, w, 0);
                          else ctx.lineTo(w, 0);
                          ctx.lineTo(w, h);
                          if (isCurved) ctx.quadraticCurveTo(w / 2, h + curvature * 2, 0, h);
                          else ctx.lineTo(0, h);
                          ctx.closePath();
                          ctx.fillStrokeShape(shape);
                        }}
                        fill="#ffffff"
                        stroke={strokeCol}
                        strokeWidth={2}
                      />
                      {/* Center line (glass pane) */}
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          ctx.beginPath();
                          ctx.moveTo(0, h / 2);
                          if (isCurved) ctx.quadraticCurveTo(w / 2, h / 2 + curvature * 2, w, h / 2);
                          else ctx.lineTo(w, h / 2);
                          ctx.strokeShape(shape);
                        }}
                        stroke={strokeCol}
                        strokeWidth={1}
                        listening={false}
                      />
                      {/* Top inner line */}
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          ctx.beginPath();
                          ctx.moveTo(0, h * 0.2);
                          if (isCurved) ctx.quadraticCurveTo(w / 2, h * 0.2 + curvature * 2, w, h * 0.2);
                          else ctx.lineTo(w, h * 0.2);
                          ctx.strokeShape(shape);
                        }}
                        stroke={strokeCol}
                        strokeWidth={0.5}
                        opacity={0.5}
                        listening={false}
                      />
                      {/* Bottom inner line */}
                      <Shape
                        sceneFunc={(ctx, shape) => {
                          ctx.beginPath();
                          ctx.moveTo(0, h * 0.8);
                          if (isCurved) ctx.quadraticCurveTo(w / 2, h * 0.8 + curvature * 2, w, h * 0.8);
                          else ctx.lineTo(w, h * 0.8);
                          ctx.strokeShape(shape);
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
          <h3>Properties</h3>
          {selectedElement ? (
            <div className="properties-panel">
              <div className="prop-row">
                <span>ID:</span>
                <span>{selectedElement.id}</span>
              </div>
              <div className="prop-row">
                <span>Type:</span>
                <span className="capitalize">{selectedElement.type}</span>
              </div>
              {selectedElement.type === 'wall' && (
                <>
                  <div className="prop-row">
                    <label>Length (px)</label>
                    <input
                      type="number"
                      value={Math.round(Math.hypot(selectedElement.endX - selectedElement.startX, selectedElement.endY - selectedElement.startY))}
                      onChange={(e) => {
                        const newLen = Math.max(1, Number(e.target.value));
                        const dx = selectedElement.endX - selectedElement.startX;
                        const dy = selectedElement.endY - selectedElement.startY;
                        const currLen = Math.hypot(dx, dy);
                        const ratio = newLen / Math.max(1, currLen);
                        const newEndX = selectedElement.startX + dx * ratio;
                        const newEndY = selectedElement.startY + dy * ratio;
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, endX: newEndX, endY: newEndY } : el))
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Thickness</label>
                    <input
                      type="number"
                      value={selectedElement.thickness}
                      onChange={(e) => {
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, thickness: Number(e.target.value) } : el))
                      }}
                      onBlur={() => setSelectedElementId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setSelectedElementId(null)
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
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, curvature: Number(e.target.value) } : el))
                      }}
                    />
                  </div>
                </>
              )}
              {(selectedElement.type === 'door' || selectedElement.type === 'window') && (
                <>
                  <div className="prop-row">
                    <label>Width</label>
                    <input
                      type="number"
                      value={selectedElement.width}
                      onChange={(e) => {
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, width: Number(e.target.value) } : el))
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Height</label>
                    <input
                      type="number"
                      value={selectedElement.height}
                      onChange={(e) => {
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, height: Number(e.target.value) } : el))
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Rotation</label>
                    <input
                      type="number"
                      value={selectedElement.rotation || 0}
                      onChange={(e) => {
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, rotation: Number(e.target.value) } : el))
                      }}
                    />
                    <span style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>Hint: Press 'R' to rotate 90°</span>
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
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, text: e.target.value } : el))
                      }}
                    />
                  </div>
                  <div className="prop-row">
                    <label>Font Size</label>
                    <input
                      type="number"
                      value={selectedElement.fontSize || 24}
                      onChange={(e) => {
                        updateElements(elements.map(el => el.id === selectedElement.id ? { ...el, fontSize: Number(e.target.value) } : el))
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="no-selection">Select an object to view properties</div>
          )}
        </div>
      </div>

      {/* Coordinates Display */}
      <div className="coords-display">
        <span>X: {cursorPos.x}</span>
        <span className="coords-sep">|</span>
        <span>Y: {cursorPos.y}</span>
      </div>
    </div>
  )
}

export default Editor
