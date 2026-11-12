import { useCallback } from 'react'
import type Konva from 'konva'
import { toast } from '../../components/toast/toast'

// Download the plan as a PNG: the whole canvas at 1:1 (2× pixel density),
// without the selection highlight or the trace image.
export function useExportPng(
  stageRef: React.RefObject<Konva.Stage | null>,
  plan: { name: string; canvasWidth: number; canvasHeight: number } | null,
  selected: { id: string | null; set: (id: string | null) => void },
) {
  const { id: selectedId, set: setSelectedId } = selected

  return useCallback(() => {
    const stage = stageRef.current
    if (!stage || !plan) return

    const oldScale = stage.scaleX()
    const oldPosition = stage.position()
    const oldSelected = selectedId
    setSelectedId(null)

    // Reset the view for the export; the trace image is reference only.
    stage.scale({ x: 1, y: 1 })
    stage.position({ x: 0, y: 0 })
    const trace = stage.findOne('.trace-image')
    trace?.hide()

    try {
      const dataURL = stage.toDataURL({
        x: 0,
        y: 0,
        width: plan.canvasWidth,
        height: plan.canvasHeight,
        pixelRatio: 2,
      })
      const link = document.createElement('a')
      link.download = `${plan.name.replace(/\s+/g, '_')}_Export.png`
      link.href = dataURL
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      toast.success('Exported the plan as a PNG image.')
    } catch {
      toast.error('Could not export the plan as an image.')
    } finally {
      trace?.show()
      stage.scale({ x: oldScale, y: oldScale })
      stage.position(oldPosition)
      setSelectedId(oldSelected)
    }
  }, [stageRef, plan, selectedId, setSelectedId])
}
