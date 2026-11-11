// A labelled input. Use for every form field so labels, spacing and focus
// look the same everywhere.
import type { InputHTMLAttributes, ReactNode } from 'react'

export const inputClass =
  'w-full rounded-lg border border-solid border-line bg-field/60 px-3.5 py-2.5 text-sm text-ink ' +
  'placeholder:text-muted outline-none transition-colors ' +
  'focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-50 ' +
  'file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:text-ink'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
  hint?: ReactNode
}

export default function Field({ label, hint, className = '', ...input }: FieldProps) {
  return (
    <label className={`flex flex-col gap-2 text-sm font-medium text-ink-soft ${className}`}>
      {label}
      <input className={inputClass} {...input} />
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  )
}
