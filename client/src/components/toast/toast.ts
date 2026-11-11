// App-wide notifications ("toasts"): small messages in the corner that tell the
// user something worked or failed. Call from anywhere, React or not:
//
//   toast.success('Project saved')
//   toast.error(getApiErrorMessage(err, 'Could not save the project.'))
//
// Rendered by <Toaster /> (mounted once in main.tsx). Passing the same `id`
// again replaces that toast instead of stacking a new one, so a repeating
// failure (e.g. autosave) shows one message, not a pile.

export type ToastKind = 'success' | 'error' | 'info'

export interface Toast {
  id: string
  kind: ToastKind
  message: string
  // Milliseconds before it closes by itself; 0 = stays until dismissed.
  duration: number
}

interface ToastOptions {
  id?: string
  duration?: number
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 3000,
  info: 4000,
  // Errors stay longer: the user needs time to read what went wrong.
  error: 8000,
}
const MAX_VISIBLE = 4

let toasts: Toast[] = []
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let nextId = 0

const emit = () => listeners.forEach((listener) => listener())

function dismiss(id: string) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function show(kind: ToastKind, message: string, options: ToastOptions = {}): string {
  const id = options.id ?? `toast-${++nextId}`
  const toast: Toast = { id, kind, message, duration: options.duration ?? DEFAULT_DURATION[kind] }

  clearTimeout(timers.get(id))
  const others = toasts.filter((t) => t.id !== id)
  toasts = [...others, toast].slice(-MAX_VISIBLE)
  if (toast.duration > 0) {
    timers.set(id, setTimeout(() => dismiss(id), toast.duration))
  }
  emit()
  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show('success', message, options),
  error: (message: string, options?: ToastOptions) => show('error', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  dismiss,
}

// For <Toaster /> (useSyncExternalStore).
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getToasts(): Toast[] {
  return toasts
}
