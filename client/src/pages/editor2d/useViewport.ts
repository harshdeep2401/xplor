import { useCallback, useEffect, useRef, useState } from 'react'
import type Konva from 'konva'

// The most a plan can be zoomed in.
const MAX_SCALE = 10
// Fitting leaves 10% of the viewport as a margin.
const FIT_MARGIN = 0.9

// The canvas area and the view into the plan: its measured size, the zoom and
// pan of the Konva stage, fit-to-screen, and zooming (buttons, keys, wheel).
// Zoom never goes below "whole plan visible" nor above 10×.
export function useViewport(
  plan: { canvasWidth: number; canvasHeight: number } | null,
  stageRef: React.RefObject<Konva.Stage | null>,
) {
  const [stageScale, setStageScale] = useState(1)
  const [stagePosition, setStagePosition] = useState({ x: 0, y: 0 })

  // Size of the canvas area (between the sidebars, under the top bar), kept up
  // to date as the window resizes. Starts with an estimate until measured.
  const [viewport, setViewport] = useState(() => ({
    width: Math.max(300, window.innerWidth - 500),
    height: Math.max(300, window.innerHeight - 60),
  }))
  const [canvasArea, setCanvasArea] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState(false)
  useEffect(() => {
    if (!canvasArea) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setViewport({ width: Math.floor(width), height: Math.floor(height) })
        setMeasured(true)
      }
    })
    observer.observe(canvasArea)
    return () => observer.disconnect()
  }, [canvasArea])

  const fitScale = useCallback(() => {
    if (!plan) return 0.1
    return (
      Math.min(viewport.width / plan.canvasWidth, viewport.height / plan.canvasHeight) * FIT_MARGIN
    )
  }, [plan, viewport.width, viewport.height])

  const fitToScreen = useCallback(() => {
    if (!plan) return
    const scale = fitScale()
    setStageScale(scale)
    setStagePosition({
      x: (viewport.width - plan.canvasWidth * scale) / 2,
      y: (viewport.height - plan.canvasHeight * scale) / 2,
    })
  }, [plan, viewport.width, viewport.height, fitScale])

  // Fit once, when the plan has loaded and the canvas area has been measured.
  // Later resizes keep the user's zoom (the Fit button refits).
  const fittedRef = useRef(false)
  useEffect(() => {
    if (plan && measured && !fittedRef.current) {
      fittedRef.current = true
      fitToScreen()
    }
  }, [plan, measured, fitToScreen])

  // Zoom by `factor`, keeping the plan point under `anchor` (stage pixels)
  // where it is.
  const zoomAround = useCallback(
    (factor: number, anchor: { x: number; y: number }) => {
      const stage = stageRef.current
      if (!stage) return
      const oldScale = stage.scaleX()
      const newScale = Math.max(fitScale(), Math.min(MAX_SCALE, oldScale * factor))
      if (Math.abs(newScale - oldScale) < 0.001) return
      const planPoint = {
        x: (anchor.x - stage.x()) / oldScale,
        y: (anchor.y - stage.y()) / oldScale,
      }
      setStageScale(newScale)
      setStagePosition({
        x: anchor.x - planPoint.x * newScale,
        y: anchor.y - planPoint.y * newScale,
      })
    },
    [stageRef, fitScale],
  )

  // Buttons and keys zoom around the middle of the view.
  const zoomBy = useCallback(
    (factor: number) => {
      const stage = stageRef.current
      if (!stage) return
      zoomAround(factor, { x: stage.width() / 2, y: stage.height() / 2 })
    },
    [stageRef, zoomAround],
  )

  // The mouse wheel zooms around the pointer.
  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const pointer = stageRef.current?.getPointerPosition()
    if (!pointer) return
    zoomAround(e.evt.deltaY < 0 ? 1.05 : 1 / 1.05, pointer)
  }

  return {
    viewport,
    setCanvasArea,
    stageScale,
    stagePosition,
    fitToScreen,
    zoomBy,
    handleWheel,
  }
}
