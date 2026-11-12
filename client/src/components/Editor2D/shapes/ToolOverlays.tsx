import { Circle, Group, Label, Line, Rect, Tag, Text } from 'react-konva'
import { formatMetres } from '../../../editor/canvas/editing'
import { lineLength, type Line2D } from '../../../pages/editor2d/types'

const CALIBRATE_COLOUR = '#f59e0b'
const MEASURE_COLOUR = '#14b8a6'

interface ToolOverlaysProps {
  calibration: Line2D | null
  measureLine: Line2D | null
  selectionBox: Line2D | null
  pixelsPerMetre: number
  // The measure line stays the same size on screen at any zoom.
  stageScale: number
}

// What the tools draw over the plan while in use: the calibration line (px),
// the measuring line (metres) and the selection box. None of it is saved.
export default function ToolOverlays({
  calibration,
  measureLine,
  selectionBox,
  pixelsPerMetre,
  stageScale,
}: ToolOverlaysProps) {
  const s = stageScale
  return (
    <>
      {calibration && (
        <Group listening={false}>
          <Line
            points={[calibration.startX, calibration.startY, calibration.endX, calibration.endY]}
            stroke={CALIBRATE_COLOUR}
            strokeWidth={3}
            dash={[10, 6]}
          />
          <Circle
            x={calibration.startX}
            y={calibration.startY}
            radius={6}
            fill={CALIBRATE_COLOUR}
          />
          <Circle x={calibration.endX} y={calibration.endY} radius={6} fill={CALIBRATE_COLOUR} />
          <Label
            x={(calibration.startX + calibration.endX) / 2}
            y={(calibration.startY + calibration.endY) / 2 - 30}
          >
            <Tag fill={CALIBRATE_COLOUR} cornerRadius={4} />
            <Text
              text={`${Math.round(lineLength(calibration))} px`}
              fontSize={14}
              padding={4}
              fill="#ffffff"
            />
          </Label>
        </Group>
      )}

      {measureLine && (
        <Group listening={false}>
          <Line
            points={[measureLine.startX, measureLine.startY, measureLine.endX, measureLine.endY]}
            stroke={MEASURE_COLOUR}
            strokeWidth={3 / s}
            dash={[10 / s, 6 / s]}
          />
          <Circle
            x={measureLine.startX}
            y={measureLine.startY}
            radius={5 / s}
            fill={MEASURE_COLOUR}
          />
          <Circle x={measureLine.endX} y={measureLine.endY} radius={5 / s} fill={MEASURE_COLOUR} />
          <Label
            x={(measureLine.startX + measureLine.endX) / 2}
            y={(measureLine.startY + measureLine.endY) / 2}
            scaleX={1 / s}
            scaleY={1 / s}
            offsetY={28}
          >
            <Tag fill={MEASURE_COLOUR} cornerRadius={4} />
            <Text
              text={formatMetres(lineLength(measureLine), pixelsPerMetre)}
              fontSize={14}
              padding={5}
              fill="#ffffff"
              fontStyle="bold"
            />
          </Label>
        </Group>
      )}

      {selectionBox && (
        <Rect
          x={Math.min(selectionBox.startX, selectionBox.endX)}
          y={Math.min(selectionBox.startY, selectionBox.endY)}
          width={Math.abs(selectionBox.endX - selectionBox.startX)}
          height={Math.abs(selectionBox.endY - selectionBox.startY)}
          fill="rgba(20, 184, 166, 0.2)"
          stroke={MEASURE_COLOUR}
          strokeWidth={1}
          listening={false}
        />
      )}
    </>
  )
}
