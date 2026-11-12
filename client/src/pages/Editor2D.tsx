// The 2D floor-plan editor. This page only wires the pieces together:
//   state & behaviour  pages/editor2d/*   (project + autosave, history,
//                      selection, viewport, pointer tools, shortcuts...)
//   rendering          components/Editor2D/*   (top bar, tools, Konva stage,
//                      properties sidebar)
//   pure logic         editor/canvas/*   (snapping, drawing, canvas-v2)
import { useCallback, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Konva from 'konva'
import type { ImportResult } from '../types/api'
import { formatMetres } from '../editor/canvas/editing'
import { snapToWallEdge } from '../editor/canvas/snapping'
import Topbar2D from '../components/Editor2D/Topbar2D'
import ImportBanner from '../components/Editor2D/ImportBanner'
import ToolPalette from '../components/Editor2D/ToolPalette'
import PlanStage from '../components/Editor2D/PlanStage'
import PropertiesSidebar from '../components/Editor2D/PropertiesSidebar'
import type { ElementInteraction } from '../components/Editor2D/shapes/interaction'
import { useElementHistory } from './editor2d/useElementHistory'
import { useProject2D } from './editor2d/useProject2D'
import { useSelection } from './editor2d/useSelection'
import { useViewport } from './editor2d/useViewport'
import { useMeasureTools } from './editor2d/useMeasureTools'
import { usePlanPointer } from './editor2d/usePlanPointer'
import { useShortcuts2D } from './editor2d/useShortcuts2D'
import { useExportPng } from './editor2d/useExportPng'
import { useTraceImage } from './editor2d/useTraceImage'
import type { Tool } from './editor2d/types'
import '../styles/editor.css'

// Trackpads report tiny finger movements while clicking; treat them as clicks.
Konva.dragDistance = 5

function Editor2D() {
  const { projectId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [importResult, setImportResult] = useState<ImportResult | null>(
    (location.state as { importResult?: ImportResult } | null)?.importResult ?? null,
  )

  const history = useElementHistory()
  const doc = useProject2D(projectId, history)
  const { project, pixelsPerMetre } = doc
  const selection = useSelection(history)
  const measure = useMeasureTools(doc.setPixelsPerMetre)

  const [activeTool, setActiveTool] = useState<Tool>('select')
  const stageRef = useRef<Konva.Stage | null>(null)
  const view = useViewport(project, stageRef)

  // Trace layer (uploaded floor plan).
  const traceImage = useTraceImage(project?.floorPlanUrl)
  const [showTrace, setShowTrace] = useState(true)
  const [traceOpacity, setTraceOpacity] = useState(0.5)

  const pointer = usePlanPointer({ plan: project, activeTool, history, selection, measure })
  const exportPng = useExportPng(stageRef, project, {
    id: selection.selectedElementId,
    set: selection.setSelectedElementId,
  })

  const { setSelectedElementId, clearSelection } = selection
  const undo = useCallback(() => {
    if (history.undo()) setSelectedElementId(null)
  }, [history, setSelectedElementId])
  const redo = useCallback(() => {
    if (history.redo()) setSelectedElementId(null)
  }, [history, setSelectedElementId])

  const { setMeasureLine } = measure
  const escape = useCallback(() => {
    clearSelection()
    setMeasureLine(null)
    setActiveTool('select')
  }, [clearSelection, setMeasureLine])

  useShortcuts2D({
    selection,
    allIds: history.elements.map((el) => el.id),
    pixelsPerMetre,
    undo,
    redo,
    zoomBy: view.zoomBy,
    escape,
  })

  const selectTool = (tool: Tool) => {
    if (tool !== 'calibrate') measure.clearCalibration()
    if (tool !== 'measure') measure.setMeasureLine(null)
    setActiveTool(tool)
  }

  const applyCalibration = () => {
    if (measure.applyCalibration()) setActiveTool('select')
  }

  if (doc.loadError) {
    return (
      <div className="editor-loading">
        <p>{doc.loadError}</p>
        <button className="topbar-btn" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
    )
  }
  if (!project) return <div className="editor-loading">Loading Project...</div>

  const { elements } = history
  const ctx: ElementInteraction = {
    onElementClick: pointer.onElementClick,
    draggable: (id) => activeTool === 'select' && !selection.inMultiSelection(id),
    isSelected: selection.isSelected,
    snapToWall: (x, y) => snapToWallEdge(x, y, elements),
    bounds: { width: project.canvasWidth, height: project.canvasHeight },
  }

  return (
    <div className="editor-container">
      <Topbar2D
        projectName={project.name}
        saveStatus={doc.saveStatus}
        onBack={() => navigate('/dashboard')}
        pixelsPerMetre={pixelsPerMetre}
        onPixelsPerMetreChange={doc.setPixelsPerMetre}
        wallHeight={doc.wallHeight}
        onWallHeightChange={doc.setWallHeight}
        hasTrace={Boolean(project.floorPlanUrl)}
        showTrace={showTrace}
        onShowTraceChange={setShowTrace}
        traceOpacity={traceOpacity}
        onTraceOpacityChange={setTraceOpacity}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={undo}
        onRedo={redo}
        zoomPercent={Math.round(view.stageScale * 100)}
        onZoomIn={() => view.zoomBy(1.2)}
        onZoomOut={() => view.zoomBy(1 / 1.2)}
        onFit={view.fitToScreen}
        onExport={exportPng}
        onConvert={() => void doc.convertTo3D()}
      />

      {importResult && (
        <ImportBanner result={importResult} onDismiss={() => setImportResult(null)} />
      )}

      <div className="editor-main">
        <ToolPalette activeTool={activeTool} onSelect={selectTool} />

        <div className="editor-canvas-wrapper" ref={view.setCanvasArea}>
          <PlanStage
            stageRef={stageRef}
            size={view.viewport}
            scale={view.stageScale}
            position={view.stagePosition}
            plan={project}
            elements={elements}
            pixelsPerMetre={pixelsPerMetre}
            trace={{ image: traceImage, show: showTrace, opacity: traceOpacity }}
            ctx={ctx}
            drawingId={pointer.isDrawing ? (elements.at(-1)?.id ?? null) : null}
            onElementChange={history.patchElement}
            overlays={{
              calibration: activeTool === 'calibrate' ? measure.calibration : null,
              measureLine: activeTool === 'measure' ? measure.measureLine : null,
              selectionBox: pointer.selectionBox,
            }}
            onMouseDown={pointer.onMouseDown}
            onMouseMove={pointer.onMouseMove}
            onMouseUp={pointer.onMouseUp}
            onWheel={view.handleWheel}
            onBackgroundDoubleClick={() => {
              setActiveTool('select')
              setSelectedElementId(null)
            }}
          />
        </div>

        <PropertiesSidebar
          activeTool={activeTool}
          pixelsPerMetre={pixelsPerMetre}
          measure={measure}
          onApplyCalibration={applyCalibration}
          selectedCount={selection.selectedIds.length}
          selectedElement={selection.selectedElement}
          onPatch={history.patchElement}
          onDuplicate={selection.duplicateSelection}
          onDelete={selection.deleteSelection}
        />
      </div>

      {/* Pointer position in metres from the canvas's top-left corner */}
      <div className="coords-display">
        <span>X: {formatMetres(pointer.cursorPos.x, pixelsPerMetre)}</span>
        <span className="coords-sep">|</span>
        <span>Y: {formatMetres(pointer.cursorPos.y, pixelsPerMetre)}</span>
      </div>
    </div>
  )
}

export default Editor2D
