// The app's one button. Variants:
//   primary   - the main action on a screen or dialog (Create, Save, Export)
//   secondary - other actions (Cancel, Undo)
//   ghost     - low-emphasis icon/text buttons in toolbars
//   danger    - destructive actions (Delete)
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  // Shows a spinner and disables the button while an action runs.
  loading?: boolean
  icon?: ReactNode
}

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-solid font-semibold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white border-transparent hover:enabled:bg-primary-hover',
  secondary: 'bg-surface-2 text-ink border-line hover:enabled:bg-field',
  ghost: 'bg-transparent text-muted border-transparent hover:enabled:bg-white/5 hover:enabled:text-ink',
  danger: 'bg-danger/90 text-white border-transparent hover:enabled:bg-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim()
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  className = '',
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  )
}
