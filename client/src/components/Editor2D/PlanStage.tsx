import type Konva from 'konva'
import { Layer, Stage } from 'react-konva'
import type { EditorElement, WallElement } from '../../editor/canvas/elements'
import type { Line2D } from '../../pages/editor2d/types'
import PlanBoard from './shapes/PlanBoard'
import Walls from './shapes/Walls'
import { DoorShape, LabelShape, WindowShape } from './shapes/Openings'
import ToolOverlays from './shapes/ToolOverlays'
import type { ElementInteraction } from './shapes/interaction'

type MouseHandler = (e: Konva.KonvaEventObject<MouseEvent>) => void

interface PlanStageProps {
  stageRef: React.RefObject<Konva.Stage | null>
  size: { width: number; height: number }
  scale: number
  position: { x: number; y: number }
  plan: { canvasWidth: number; canvasHeight: number }
  elements: EditorElement[]
  pixelsPerMetre: number
  trace: { image: HTMLImageElement | null; show: boolean; opacity: number }
  ctx: ElementInteraction
  drawingId: string | null
  onElementChange: (id: string, patch: Partial<EditorElement>) => void
  overlays: { calibration: Line2D | null; measureLine: Line2D | null; selectionBox: Line2D | null }
  onMouseDown: MouseHandler
  onMouseMove: MouseHandler
  onMouseUp: MouseHandler
  onWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  // Double-click/tap on empty board: back to the Select tool, nothing selected.
  onBackgroundDoubleClick: () => void
}

// The Konva stage: the board, then walls, then doors/windows/labels on top,
// then whatever the active tool is drawing.
export default function PlanStage(props: PlanStageProps) {
  const { plan, elements, ctx, onElementChange } = props
  const onBackground = (e: Konva.KonvaEventObject<Event>) => {
    if (e.target === e.target.getStage() || e.target.name() === 'canvas-board') {
      props.onBackgroundDoubleClick()
    }
  }

  return (
    <Stage
      width={props.size.width}
      height={props.size.height}
      onMouseDown={props.onMouseDown}
      onMouseMove={props.onMouseMove}
      onMouseUp={props.onMouseUp}
      onWheel={props.onWheel}
      onDblClick={onBackground}
      onDblTap={onBackground}
      scaleX={props.scale}
      scaleY={props.scale}
      x={props.position.x}
      y={props.position.y}
      ref={props.stageRef}
      className="konva-stage"
    >
      <Layer>
        <PlanBoard
          width={plan.canvasWidth}
          height={plan.canvasHeight}
          pixelsPerMetre={props.pixelsPerMetre}
          traceImage={props.trace.image}
          showTrace={props.trace.show}
          traceOpacity={props.trace.opacity}
        />
        <Walls
          walls={elements.filter((el): el is WallElement => el.type === 'wall')}
          ctx={ctx}
          drawingId={props.drawingId}
          pixelsPerMetre={props.pixelsPerMetre}
        />
        {elements.map((el) => {
          switch (el.type) {
            case 'label':
              return <LabelShape key={el.id} el={el} ctx={ctx} onChange={onElementChange} />
            case 'door':
              return <DoorShape key={el.id} el={el} ctx={ctx} onChange={onElementChange} />
            case 'window':
              return <WindowShape key={el.id} el={el} ctx={ctx} onChange={onElementChange} />
            default:
              return null
          }
        })}
        <ToolOverlays
          {...props.overlays}
          pixelsPerMetre={props.pixelsPerMetre}
          stageScale={props.scale}
        />
      </Layer>
    </Stage>
  )
}
