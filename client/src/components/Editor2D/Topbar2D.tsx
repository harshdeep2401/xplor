// The 2D editor's top bar: project, save status, scale and wall height, the
// trace-image controls, undo/redo, zoom, export and Convert to 3D.

interface Topbar2DProps {
  projectName: string
  saveStatus: string
  onBack: () => void
  pixelsPerMetre: number
  onPixelsPerMetreChange: (value: number) => void
  wallHeight: number
  onWallHeightChange: (value: number) => void
  // Trace controls are shown only for a project with an uploaded floor plan.
  hasTrace: boolean
  showTrace: boolean
  onShowTraceChange: (show: boolean) => void
  traceOpacity: number
  onTraceOpacityChange: (opacity: number) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  zoomPercent: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  onExport: () => void
  onConvert: () => void
}

export default function Topbar2D(props: Topbar2DProps) {
  return (
    <div className="editor-topbar">
      <div className="topbar-left">
        <button className="back-btn" onClick={props.onBack} aria-label="Back to dashboard">
          &larr;
        </button>
        <div className="project-title">{props.projectName}</div>
      </div>
      <div className="topbar-center">
        <div className="save-status" role="status">
          {props.saveStatus}
        </div>
      </div>
      <div className="topbar-right">
        {/* Project scale + wall height → persisted into the canvas-v2 contract. */}
        <label className="scale-field" title="Canvas pixels per real-world metre">
          px/m
          <input
            type="number"
            min={1}
            step={1}
            value={props.pixelsPerMetre}
            onChange={(e) => props.onPixelsPerMetreChange(Math.max(1, Number(e.target.value) || 1))}
          />
        </label>
        <label className="scale-field" title="Wall height in metres (3D extrusion)">
          wall h (m)
          <input
            type="number"
            min={0.1}
            step={0.1}
            value={props.wallHeight}
            onChange={(e) => props.onWallHeightChange(Math.max(0.1, Number(e.target.value) || 0.1))}
          />
        </label>
        {props.hasTrace && (
          <div className="trace-controls" title="Uploaded floor plan shown under the drawing">
            <label className="trace-toggle">
              <input
                type="checkbox"
                checked={props.showTrace}
                onChange={(e) => props.onShowTraceChange(e.target.checked)}
              />
              Trace
            </label>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={props.traceOpacity}
              disabled={!props.showTrace}
              onChange={(e) => props.onTraceOpacityChange(Number(e.target.value))}
              aria-label="Trace image opacity"
            />
          </div>
        )}
        <button className="topbar-btn" onClick={props.onUndo} disabled={!props.canUndo}>
          Undo
        </button>
        <button className="topbar-btn" onClick={props.onRedo} disabled={!props.canRedo}>
          Redo
        </button>
        <button className="topbar-btn" onClick={props.onZoomIn}>
          Zoom In
        </button>
        <button className="topbar-btn" onClick={props.onZoomOut}>
          Zoom Out
        </button>
        <button className="topbar-btn" onClick={props.onFit}>
          Fit
        </button>
        <span className="zoom-label">{props.zoomPercent}%</span>
        <button className="topbar-btn export-btn" onClick={props.onExport}>
          Export
        </button>
        <button className="topbar-btn export-btn" onClick={props.onConvert}>
          Convert to 3D
        </button>
      </div>
    </div>
  )
}
