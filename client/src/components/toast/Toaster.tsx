// Renders the toasts from ./toast.ts in the bottom-right corner. Mounted once
// in main.tsx, so every page (including the 3D editor) shows them.
import { useSyncExternalStore } from 'react'
import { CircleCheck, CircleX, Info, X } from 'lucide-react'
import { getToasts, subscribe, toast } from './toast'
import '../../styles/toast.css'

const ICONS = {
  success: CircleCheck,
  error: CircleX,
  info: Info,
}

export default function Toaster() {
  const toasts = useSyncExternalStore(subscribe, getToasts)

  return (
    <div className="toaster" aria-live="polite">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <Icon className="toast-icon" size={18} aria-hidden="true" />
            <p className="toast-message">{t.message}</p>
            <button className="toast-close" onClick={() => toast.dismiss(t.id)} aria-label="Dismiss">
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
