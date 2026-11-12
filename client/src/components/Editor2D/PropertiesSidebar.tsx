import { CopyPlus, Trash2 } from 'lucide-react'
import type {
  DoorElement,
  EditorElement,
  LabelElement,
  WallElement,
  WindowElement,
} from '../../editor/canvas/elements'
import { formatMetres } from '../../editor/canvas/editing'
import type { Tool } from '../../pages/editor2d/types'
import type { MeasureTools } from '../../pages/editor2d/useMeasureTools'
import NumberInput from '../ui/NumberInput'

type Patch = (id: string, patch: Partial<EditorElement>) => void

interface PropertiesSidebarProps {
  activeTool: Tool
  pixelsPerMetre: number
  measure: MeasureTools
  onApplyCalibration: () => void
  selectedCount: number
  selectedElement: EditorElement | undefined
  onPatch: Patch
  onDuplicate: () => void
  onDelete: () => void
}

// The right sidebar: help for the Measure and Calibrate tools, actions for a
// multi-selection, the selected element's properties, or (with nothing
// selected) the keyboard shortcuts.
export default function PropertiesSidebar(props: PropertiesSidebarProps) {
  const { activeTool, selectedCount, selectedElement } = props
  const title =
    activeTool === 'calibrate'
      ? 'Calibrate Scale'
      : activeTool === 'measure'
        ? 'Measure'
        : selectedCount > 1
          ? 'Selection'
          : 'Properties'

  return (
    <div className="editor-sidebar right-sidebar">
      <h3>{title}</h3>
      {activeTool === 'measure' ? (
        <MeasurePanel measure={props.measure} pixelsPerMetre={props.pixelsPerMetre} />
      ) : activeTool === 'calibrate' ? (
        <CalibratePanel
          measure={props.measure}
          pixelsPerMetre={props.pixelsPerMetre}
          onApply={props.onApplyCalibration}
        />
      ) : selectedCount > 1 ? (
        <SelectionPanel
          count={selectedCount}
          onDuplicate={props.onDuplicate}
          onDelete={props.onDelete}
        />
      ) : selectedElement ? (
        <div className="properties-panel">
          <div className="prop-row">
            <span>Type:</span>
            <span className="capitalize">{selectedElement.type}</span>
          </div>
          {selectedElement.type === 'wall' && (
            <WallProperties
              wall={selectedElement}
              pxPerM={props.pixelsPerMetre}
              onPatch={props.onPatch}
            />
          )}
          {(selectedElement.type === 'door' || selectedElement.type === 'window') && (
            <OpeningProperties
              opening={selectedElement}
              pxPerM={props.pixelsPerMetre}
              onPatch={props.onPatch}
            />
          )}
          {selectedElement.type === 'label' && (
            <LabelProperties label={selectedElement} onPatch={props.onPatch} />
          )}
        </div>
      ) : (
        <Shortcuts />
      )}
    </div>
  )
}

function MeasurePanel({
  measure,
  pixelsPerMetre,
}: {
  measure: MeasureTools
  pixelsPerMetre: number
}) {
  return (
    <div className="properties-panel">
      <p className="calibrate-help">
        Drag across the plan to measure a distance. Hold Shift for a straight line. Measurements
        aren't saved.
      </p>
      <div className="prop-row">
        <span>Distance</span>
        <span>
          {measure.measurePx >= 1 ? formatMetres(measure.measurePx, pixelsPerMetre) : '—'}
        </span>
      </div>
      <p className="calibrate-help">
        Based on the scale {pixelsPerMetre} px/m. If it looks wrong, set the scale with Calibrate
        first.
      </p>
    </div>
  )
}

function CalibratePanel({
  measure,
  pixelsPerMetre,
  onApply,
}: {
  measure: MeasureTools
  pixelsPerMetre: number
  onApply: () => void
}) {
  return (
    <div className="properties-panel">
      <p className="calibrate-help">
        Drag along something whose real length you know (e.g. a wall with a dimension on the plan),
        then enter that length.
      </p>
      <div className="prop-row">
        <span>Measured</span>
        <span>{measure.calibrationPx >= 1 ? `${Math.round(measure.calibrationPx)} px` : '—'}</span>
      </div>
      <div className="prop-row">
        <label htmlFor="calibration-metres">Real length (m)</label>
        <input
          id="calibration-metres"
          type="number"
          min={0}
          step={0.01}
          value={measure.calibrationMetres}
          disabled={measure.calibrationPx < 1}
          onChange={(e) => measure.setCalibrationMetres(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onApply()
          }}
        />
      </div>
      {measure.proposedScale !== null && (
        <div className="prop-row">
          <span>New scale</span>
          <span>{measure.proposedScale.toFixed(2)} px/m</span>
        </div>
      )}
      <button
        className="topbar-btn export-btn calibrate-apply"
        onClick={onApply}
        disabled={!measure.canApplyCalibration}
      >
        Apply scale
      </button>
      <div className="prop-row">
        <span>Current scale</span>
        <span>{pixelsPerMetre} px/m</span>
      </div>
    </div>
  )
}

function SelectionPanel({
  count,
  onDuplicate,
  onDelete,
}: {
  count: number
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div className="properties-panel">
      <div className="prop-row">
        <span>Selected</span>
        <span>{count} items</span>
      </div>
      <button className="topbar-btn sidebar-action" onClick={onDuplicate}>
        <CopyPlus size={14} aria-hidden="true" /> Duplicate (Ctrl+D)
      </button>
      <button className="topbar-btn sidebar-action" onClick={onDelete}>
        <Trash2 size={14} aria-hidden="true" /> Delete (Del)
      </button>
      <p className="calibrate-help">
        Drag any selected item to move them all. Arrow keys nudge by 5 cm (Shift: 50 cm). Ctrl+C /
        Ctrl+V copy and paste. Shift+click adds or removes an item.
      </p>
    </div>
  )
}

// A labelled field in the properties panel.
function Row({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="prop-row">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

function WallProperties({
  wall,
  pxPerM,
  onPatch,
}: {
  wall: WallElement
  pxPerM: number
  onPatch: Patch
}) {
  const dx = wall.endX - wall.startX
  const dy = wall.endY - wall.startY
  return (
    <>
      <Row id="wall-length" label="Length (m)">
        <NumberInput
          id="wall-length"
          min={0.01}
          step={0.05}
          value={Math.hypot(dx, dy) / pxPerM}
          onChange={(metres) => {
            // Keep the start and the direction; move the end.
            const ratio = Math.max(1, metres * pxPerM) / Math.max(1, Math.hypot(dx, dy))
            onPatch(wall.id, { endX: wall.startX + dx * ratio, endY: wall.startY + dy * ratio })
          }}
        />
      </Row>
      <Row id="wall-thickness" label="Thickness (m)">
        <NumberInput
          id="wall-thickness"
          min={0.01}
          step={0.01}
          value={wall.thickness / pxPerM}
          onChange={(metres) => onPatch(wall.id, { thickness: metres * pxPerM })}
        />
      </Row>
      <Row id="wall-curvature" label="Curvature">
        <input
          id="wall-curvature"
          type="range"
          min="-200"
          max="200"
          value={wall.curvature || 0}
          onChange={(e) => onPatch(wall.id, { curvature: Number(e.target.value) })}
        />
      </Row>
    </>
  )
}

function OpeningProperties({
  opening,
  pxPerM,
  onPatch,
}: {
  opening: DoorElement | WindowElement
  pxPerM: number
  onPatch: Patch
}) {
  return (
    <>
      <Row id="opening-width" label="Width (m)">
        <NumberInput
          id="opening-width"
          min={0.01}
          step={0.05}
          value={opening.width / pxPerM}
          onChange={(metres) => onPatch(opening.id, { width: metres * pxPerM })}
        />
      </Row>
      {opening.type === 'window' && (
        <Row id="window-depth" label="Drawn thickness (m)">
          <NumberInput
            id="window-depth"
            min={0.01}
            step={0.01}
            value={opening.height / pxPerM}
            onChange={(metres) => onPatch(opening.id, { height: metres * pxPerM })}
          />
        </Row>
      )}
      <div className="prop-row">
        <label htmlFor="opening-rotation">Rotation</label>
        <input
          id="opening-rotation"
          type="number"
          value={opening.rotation || 0}
          onChange={(e) => onPatch(opening.id, { rotation: Number(e.target.value) })}
        />
        <span style={{ fontSize: '11px', color: '#a1a1aa', marginTop: '4px' }}>
          Hint: Press 'R' to rotate 90°
        </span>
      </div>
    </>
  )
}

function LabelProperties({ label, onPatch }: { label: LabelElement; onPatch: Patch }) {
  return (
    <>
      <Row id="label-text" label="Room Name">
        <input
          id="label-text"
          type="text"
          value={label.text || ''}
          onChange={(e) => onPatch(label.id, { text: e.target.value })}
        />
      </Row>
      <Row id="label-font-size" label="Font Size">
        <input
          id="label-font-size"
          type="number"
          value={label.fontSize || 24}
          onChange={(e) => onPatch(label.id, { fontSize: Number(e.target.value) })}
        />
      </Row>
    </>
  )
}

function Shortcuts() {
  return (
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
  )
}
