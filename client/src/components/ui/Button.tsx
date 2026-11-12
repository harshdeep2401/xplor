// The app's one button. Variants:
//   primary   - the main action on a screen or dialog (Create, Save, Export)
//   secondary - other actions (Cancel, Undo)
//   ghost     - low-emphasis icon/text buttons in toolbars
//   danger    - destructive actions (Delete)
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { buttonClass, type Size, type Variant } from './buttonClass'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  // Shows a spinner and disables the button while an action runs.
  loading?: boolean
  icon?: ReactNode
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
