import type Konva from 'konva'
import { Arc, Group, Line, Rect, Shape, Text } from 'react-konva'
import type {
  DoorElement,
  EditorElement,
  LabelElement,
  WindowElement,
} from '../../../editor/canvas/elements'
import { windowCurvatureOn } from '../../../editor/canvas/snapping'
import { clickHandlers, followWall, SELECTED_COLOUR, type ElementInteraction } from './interaction'

interface ShapeProps<E extends EditorElement> {
  el: E
  ctx: ElementInteraction
  // A finished drag: the element's new fields, as one undo step.
  onChange: (id: string, patch: Partial<EditorElement>) => void
}

// A room name. Dragging moves it freely.
export function LabelShape({ el, ctx, onChange }: ShapeProps<LabelElement>) {
  const selected = ctx.isSelected(el.id)
  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      draggable={ctx.draggable(el.id)}
      onDragEnd={(e) => onChange(el.id, { x: e.target.x(), y: e.target.y() })}
      {...clickHandlers(el.id, ctx.onElementClick)}
    >
      <Rect
        x={-100}
        y={-20}
        width={200}
        height={40}
        fill={selected ? '#e0f2fe' : 'transparent'}
        cornerRadius={4}
      />
      <Text
        x={-100}
        y={-12}
        width={200}
        text={el.text || 'Room'}
        fontSize={el.fontSize || 24}
        fill={selected ? SELECTED_COLOUR : '#475569'}
        align="center"
        fontStyle={selected ? 'bold' : 'normal'}
      />
    </Group>
  )
}

// A door: the open leaf and a quarter-circle showing its swing, over a white
// gap in the wall. Dragging slides it along the nearest wall.
export function DoorShape({ el, ctx, onChange }: ShapeProps<DoorElement>) {
  const w = el.width || 120
  const colour = ctx.isSelected(el.id) ? SELECTED_COLOUR : '#94a3b8'
  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      rotation={el.rotation || 0}
      draggable={ctx.draggable(el.id)}
      onDragMove={(e) => followWall(e, ctx)}
      onDragEnd={(e) => {
        const snap = ctx.snapToWall(e.target.x(), e.target.y())
        onChange(el.id, {
          x: snap.x,
          y: snap.y,
          rotation: snap.angle ?? e.target.rotation(),
        })
      }}
      {...clickHandlers(el.id, ctx.onElementClick)}
    >
      {/* Invisible hit area — makes the door easy to click */}
      <Rect x={-4} y={-w - 4} width={w + 8} height={w + 8} fill="transparent" />
      {/* White mask over the wall behind the opening */}
      <Rect x={0} y={-16} width={w} height={32} fill="#ffffff" listening={false} />
      {/* Door leaf, open at 90° */}
      <Rect x={-4} y={-w} width={8} height={w} fill={colour} cornerRadius={2} />
      {/* Swing */}
      <Arc
        x={0}
        y={0}
        innerRadius={w - 2}
        outerRadius={w}
        angle={90}
        rotation={-90}
        fill={colour}
        stroke={colour}
        strokeWidth={1.5}
        dash={[6, 4]}
      />
      {/* Hinge */}
      <Rect x={-5} y={-5} width={10} height={10} fill={colour} cornerRadius={5} listening={false} />
      {/* Wall break lines at the opening's edges */}
      <Line points={[0, -18, 0, 18]} stroke={colour} strokeWidth={2} listening={false} />
      <Line points={[w, -18, w, 18]} stroke={colour} strokeWidth={2} listening={false} />
    </Group>
  )
}

// A window: a frame the wall's thickness deep with a pane down the middle,
// bowed when it sits on a curved wall. Dragging slides it along the nearest
// wall (and bends it to match).
export function WindowShape({ el, ctx, onChange }: ShapeProps<WindowElement>) {
  const w = el.width || 120
  const h = el.height || 10
  const colour = ctx.isSelected(el.id) ? SELECTED_COLOUR : '#1e293b'
  const bow = el.curvature || 0

  // A line across the window at height y, bowed like the window.
  const across = (y: number) => (ctx2: Konva.Context, shape: Konva.Shape) => {
    ctx2.beginPath()
    ctx2.moveTo(0, y)
    if (bow) ctx2.quadraticCurveTo(w / 2, y + bow * 2, w, y)
    else ctx2.lineTo(w, y)
    ctx2.strokeShape(shape)
  }

  return (
    <Group
      id={el.id}
      x={el.x}
      y={el.y}
      offsetX={w / 2}
      offsetY={h / 2}
      rotation={el.rotation || 0}
      draggable={ctx.draggable(el.id)}
      onDragMove={(e) => followWall(e, ctx)}
      onDragEnd={(e) => {
        const snap = ctx.snapToWall(e.target.x(), e.target.y())
        onChange(el.id, {
          x: snap.x,
          y: snap.y,
          rotation: snap.angle ?? e.target.rotation(),
          curvature: snap.wall ? windowCurvatureOn(snap.wall, w) : 0,
          attachedWallId: snap.wall ? snap.wall.id : null,
        })
      }}
      {...clickHandlers(el.id, ctx.onElementClick)}
    >
      {/* Frame */}
      <Shape
        sceneFunc={(ctx2, shape) => {
          ctx2.beginPath()
          ctx2.moveTo(0, 0)
          if (bow) ctx2.quadraticCurveTo(w / 2, bow * 2, w, 0)
          else ctx2.lineTo(w, 0)
          ctx2.lineTo(w, h)
          if (bow) ctx2.quadraticCurveTo(w / 2, h + bow * 2, 0, h)
          else ctx2.lineTo(0, h)
          ctx2.closePath()
          ctx2.fillStrokeShape(shape)
        }}
        fill="#ffffff"
        stroke={colour}
        strokeWidth={2}
      />
      {/* Glass pane */}
      <Shape sceneFunc={across(h / 2)} stroke={colour} strokeWidth={1} listening={false} />
      <Shape
        sceneFunc={across(h * 0.2)}
        stroke={colour}
        strokeWidth={0.5}
        opacity={0.5}
        listening={false}
      />
      <Shape
        sceneFunc={across(h * 0.8)}
        stroke={colour}
        strokeWidth={0.5}
        opacity={0.5}
        listening={false}
      />
    </Group>
  )
}
