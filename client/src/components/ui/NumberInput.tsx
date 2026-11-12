// A number box that lets the user type freely ("3.", "0.0") while still
// updating the value live whenever what's typed is a valid number. A plain
// controlled <input type="number"> rounds and rewrites the text on every
// keystroke, which makes decimals impossible to type.
import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'

interface NumberInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: number
  onChange: (value: number) => void
  // Decimals shown when not editing.
  decimals?: number
  min?: number
}

export default function NumberInput({
  value,
  onChange,
  decimals = 2,
  min,
  onFocus,
  onBlur,
  ...rest
}: NumberInputProps) {
  // The text being typed; null when the box isn't focused.
  const [draft, setDraft] = useState<string | null>(null)
  const formatted = String(Number(value.toFixed(decimals)))

  return (
    <input
      type="number"
      min={min}
      value={draft ?? formatted}
      onFocus={(e) => {
        setDraft(formatted)
        onFocus?.(e)
      }}
      onChange={(e) => {
        const text = e.target.value
        setDraft(text)
        const n = Number(text)
        if (text.trim() !== '' && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n)
      }}
      onBlur={(e) => {
        setDraft(null)
        onBlur?.(e)
      }}
      {...rest}
    />
  )
}
