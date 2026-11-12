import { Group, Label, Line, Tag, Text } from 'react-konva'
import type { WallElement } from '../../../editor/canvas/elements'
import { formatMetres } from '../../../editor/canvas/editing'
import { clickHandlers, SELECTED_COLOUR, type ElementInteraction } from './interaction'

const DEFAULT_THICKNESS_PX = 30

// A wall's centre line: straight, or bowed through a control point when it has
// a curvature (px, perpendicular to the wall).
function wallGeometry(wall: WallElement) {
  const dx = wall.endX - wall.startX
  const dy = wall.endY - wall.startY
  const length = Math.hypot(dx, dy)
  const curvature = wall.curvature || 0
  let midX = (wall.startX + wall.endX) / 2
  let midY = (wall.startY + wall.endY) / 2
  if (curvature !== 0) {
    midX += (-dy / Math.max(1, length)) * curvature
    midY += (dx / Math.max(1, length)) * curvature
  }
  const points =
    curvature !== 0
      ? [wall.startX, wall.startY, midX, midY, wall.endX, wall.endY]
      : [wall.startX, wall.startY, wall.endX, wall.endY]
  return {
    length,
    angle: Math.atan2(dy, dx) * (180 / Math.PI),
    midX,
    midY,
    points,
    curved: curvature !== 0,
    thickness: wall.thickness || DEFAULT_THICKNESS_PX,
  }
}

interface WallsProps {
  walls: WallElement[]
  ctx: ElementInteraction
  // The wall being drawn right now (shows its length while drawing).
  drawingId: string | null
  pixelsPerMetre: number
}

// Walls are drawn in two passes, so joined walls read as one solid outline:
// first every wall's dark outline, then every wall's light core on top. The
// core carries the clicks and, when selected or being drawn, the length.
export default function Walls({ walls, ctx, drawingId, pixelsPerMetre }: WallsProps) {
  const drawn = walls.map((wall) => ({
    wall,
    g: wallGeometry(wall),
    selected: ctx.isSelected(wall.id),
  }))
  return (
    <>
      {drawn.map(({ wall, g, selected }) => (
        <Line
          key={`outline_${wall.id}`}
          points={g.points}
          tension={g.curved ? 0.5 : 0}
          stroke={selected ? SELECTED_COLOUR : '#1e293b'}
          strokeWidth={g.thickness + 2}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      ))}
      {drawn.map(({ wall, g, selected }) => (
        <Group key={`fill_${wall.id}`} id={wall.id}>
          <Line
            points={g.points}
            tension={g.curved ? 0.5 : 0}
            stroke={selected ? '#ccfbf1' : '#f8fafc'}
            strokeWidth={g.thickness - 2}
            lineCap="round"
            lineJoin="round"
            {...clickHandlers(wall.id, ctx.onElementClick)}
          />
          {(selected || wall.id === drawingId) && g.length > 0 && (
            <Label
              x={g.midX}
              y={g.midY}
              // Keep the text upright.
              rotation={g.angle > 90 ? g.angle - 180 : g.angle < -90 ? g.angle + 180 : g.angle}
              offsetY={g.thickness / 2 + 15}
            >
              <Tag
                fill={SELECTED_COLOUR}
                cornerRadius={4}
                pointerDirection="down"
                pointerWidth={10}
                pointerHeight={10}
              />
              <Text
                text={formatMetres(g.length, pixelsPerMetre)}
                fill="white"
                padding={6}
                fontSize={16}
                fontStyle="bold"
                fontFamily="monospace"
              />
            </Label>
          )}
        </Group>
      ))}
    </>
  )
}
