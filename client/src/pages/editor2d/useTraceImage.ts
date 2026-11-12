import { useEffect, useState } from 'react'
import { toast } from '../../components/toast/toast'
import { resolveServerUrl } from '../../services/serverUrl'

// Load the uploaded floor plan for the trace layer. crossOrigin keeps the stage
// exportable (an untainted canvas) — the server's CORS middleware also covers
// /uploads.
export function useTraceImage(url: string | null | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!url) return
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => setImage(img)
    img.onerror = () =>
      toast.error(
        'Could not load the uploaded floor-plan image. You can still draw, but without the trace layer.',
        { id: 'trace-image' },
      )
    img.src = resolveServerUrl(url)
    return () => {
      img.onload = null
      img.onerror = null
    }
  }, [url])
  return image
}
