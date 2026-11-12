import type { ImportResult } from '../../types/api'

// Shown after a floor-plan upload: how detection went and what to do next.
export default function ImportBanner({
  result,
  onDismiss,
}: {
  result: ImportResult
  onDismiss: () => void
}) {
  const failed = result.status === 'failed'
  return (
    <div className={`import-banner ${failed ? 'import-banner-error' : ''}`}>
      <span>
        {result.status === 'completed'
          ? `Detected ${result.wallCount} wall${result.wallCount === 1 ? '' : 's'} from your floor plan. Fix any mistakes against the trace image, add doors and windows, then use Calibrate to set the real-world scale.`
          : `Wall detection failed (${result.error}). Your image is loaded as a trace layer, so you can draw over it.`}
      </span>
      <button className="import-banner-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
