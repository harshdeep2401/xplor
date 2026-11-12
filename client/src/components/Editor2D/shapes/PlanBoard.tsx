import { useMemo } from 'react'
import { Image as KonvaImage, Line, Rect, Text } from 'react-konva'
import { formatMetres } from '../../../editor/canvas/editing'

const GRID_PX = 50
// Every fourth grid line is a little darker.
const MAJOR_GRID_PX = 200

interface PlanBoardProps {
  width: number
  height: number
  pixelsPerMetre: number
  traceImage: HTMLImageElement | null
  showTrace: boolean
  traceOpacity: number
}

// The paper the plan is drawn on: white board, grid, the uploaded floor plan
// (trace image, 1:1 with canvas pixels, reference only), border and the
// board's size in metres.
export default function PlanBoard({
  width,
  height,
  pixelsPerMetre,
  traceImage,
  showTrace,
  traceOpacity,
}: PlanBoardProps) {
  const gridLines = useMemo(() => {
    const lines = []
    const style = (at: number) => ({
      stroke: at % MAJOR_GRID_PX === 0 ? '#d4d4d8' : '#e5e7eb',
      strokeWidth: at % MAJOR_GRID_PX === 0 ? 0.5 : 0.3,
    })
    for (let x = GRID_PX; x < width; x += GRID_PX) {
      lines.push(<Line key={`gv_${x}`} points={[x, 0, x, height]} {...style(x)} />)
    }
    for (let y = GRID_PX; y < height; y += GRID_PX) {
      lines.push(<Line key={`gh_${y}`} points={[0, y, width, y]} {...style(y)} />)
    }
    return lines
  }, [width, height])

  return (
    <>
      {/* The board — the user's actual drawing area. Double-clicking it resets the tool. */}
      <Rect
        name="canvas-board"
        x={0}
        y={0}
        width={width}
        height={height}
        fill="#ffffff"
        shadowColor="rgba(0,0,0,0.4)"
        shadowBlur={40}
        shadowOffsetX={0}
        shadowOffsetY={4}
        shadowOpacity={0.5}
      />
      {gridLines}
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
      <Rect
        x={0}
        y={0}
        width={width}
        height={height}
        stroke="#94a3b8"
        strokeWidth={2}
        listening={false}
      />
      <Text
        x={width / 2 - 40}
        y={-22}
        text={formatMetres(width, pixelsPerMetre, 1)}
        fontSize={12}
        fill="#64748b"
        fontFamily="monospace"
      />
      <Text
        x={-45}
        y={height / 2 - 6}
        text={formatMetres(height, pixelsPerMetre, 1)}
        fontSize={12}
        fill="#64748b"
        fontFamily="monospace"
        rotation={-90}
      />
    </>
  )
}
