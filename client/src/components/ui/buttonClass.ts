// Class names for the app's button look, shared by <Button> and by links styled as buttons.
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Size = 'sm' | 'md'

const BASE =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-solid font-semibold ' +
  'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white border-transparent hover:enabled:bg-primary-hover',
  secondary: 'bg-surface-2 text-ink border-line hover:enabled:bg-field',
  ghost:
    'bg-transparent text-muted border-transparent hover:enabled:bg-white/5 hover:enabled:text-ink',
  danger: 'bg-danger/90 text-white border-transparent hover:enabled:bg-danger',
}

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
}

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md', extra = '') {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${extra}`.trim()
}
