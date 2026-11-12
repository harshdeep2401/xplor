import { Move3d, Rotate3d, Scale3d, type LucideIcon } from 'lucide-react'
import type { TransformMode } from './EditorCanvas'

const MODES: { mode: TransformMode; label: string; key: string; Icon: LucideIcon }[] = [
  { mode: 'translate', label: 'Move', key: 'W', Icon: Move3d },
  { mode: 'rotate', label: 'Rotate', key: 'E', Icon: Rotate3d },
  { mode: 'scale', label: 'Resize', key: 'R', Icon: Scale3d },
]

// Move / Rotate / Resize for the selected object's handles (also W / E / R).
export default function TransformModeBar({
  mode,
  onChange,
}: {
  mode: TransformMode
  onChange: (mode: TransformMode) => void
}) {
  return (
    <div
      role="toolbar"
      aria-label="Transform mode"
      className="absolute left-3 top-3 z-10 flex gap-1 rounded-xl border border-solid border-line bg-surface/90 p-1 backdrop-blur"
    >
      {MODES.map(({ mode: m, label, key, Icon }) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          title={`${label} (${key})`}
          className={`flex cursor-pointer items-center gap-1.5 rounded-lg border-0 px-3 py-1.5 text-xs font-semibold ${
            mode === m ? 'bg-primary text-white' : 'bg-transparent text-ink-soft hover:bg-white/5'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
          <kbd className="font-mono text-[10px] opacity-60">{key}</kbd>
        </button>
      ))}
    </div>
  )
}
