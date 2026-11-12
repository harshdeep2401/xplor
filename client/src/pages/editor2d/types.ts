// Shared types for the 2D editor's pieces (pages/Editor2D.tsx and its hooks
// and components).
import {
  AppWindow,
  BrickWall,
  DoorOpen,
  MousePointer2,
  RulerDimensionLine,
  Scaling,
  Tag as TagIcon,
  Trash2,
  type LucideIcon,
} from 'lucide-react'

export type Tool =
  'select' | 'wall' | 'door' | 'window' | 'label' | 'delete' | 'pan' | 'measure' | 'calibrate'

// The left toolbar, top to bottom.
export const TOOLS: { tool: Tool; label: string; Icon: LucideIcon; title?: string }[] = [
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

export interface Editor2DProject {
  name: string
  canvasWidth: number
  canvasHeight: number
  // Stored canvas is either the canvas-v2 contract or a legacy { elements: [] }
  // payload; resolved when the project loads. Kept loose here on purpose.
  canvas: unknown
  // Canonical per-project metrics (DB columns). Used as fallback scale/height for
  // legacy canvases that don't carry their own.
  scalePixelsPerMeter?: number
  defaultWallHeightM?: number
  // Uploaded floor-plan image (Path B), shown as a trace layer under the drawing.
  floorPlanUrl?: string | null
}

// A two-point line in canvas pixels: the Calibrate and Measure tools' lines,
// and the selection box's corners.
export interface Line2D {
  startX: number
  startY: number
  endX: number
  endY: number
}

export const lineLength = (line: Line2D | null) =>
  line ? Math.hypot(line.endX - line.startX, line.endY - line.startY) : 0
