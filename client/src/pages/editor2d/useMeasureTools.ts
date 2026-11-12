import { useState } from 'react'
import { lineLength, type Line2D } from './types'

// The Measure tool (a temporary line, never saved) and the Calibrate tool (a
// line along something of known length, which sets the plan's scale).
export function useMeasureTools(setPixelsPerMetre: (pxPerMetre: number) => void) {
  const [measureLine, setMeasureLine] = useState<Line2D | null>(null)
  const [calibration, setCalibration] = useState<Line2D | null>(null)
  // The real length the user typed for the calibration line, as typed.
  const [calibrationMetres, setCalibrationMetres] = useState('')

  const measurePx = lineLength(measureLine)
  const calibrationPx = lineLength(calibration)
  const calibrationValue = Number(calibrationMetres)
  const canApplyCalibration = calibrationPx >= 1 && calibrationValue > 0

  const clearCalibration = () => {
    setCalibration(null)
    setCalibrationMetres('')
  }

  // Scale = measured pixels / real metres. Changing pixelsPerMetre triggers the
  // canvas-v2 autosave, so the new scale is persisted with the drawing.
  // Returns whether the scale was applied.
  const applyCalibration = () => {
    if (!canApplyCalibration) return false
    setPixelsPerMetre(Math.round((calibrationPx / calibrationValue) * 100) / 100)
    clearCalibration()
    return true
  }

  return {
    measureLine,
    setMeasureLine,
    measurePx,
    calibration,
    setCalibration,
    calibrationPx,
    calibrationMetres,
    setCalibrationMetres,
    // px per metre the calibration would set, once it can be applied.
    proposedScale: canApplyCalibration ? calibrationPx / calibrationValue : null,
    canApplyCalibration,
    clearCalibration,
    applyCalibration,
  }
}

export type MeasureTools = ReturnType<typeof useMeasureTools>
