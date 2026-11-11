import { Component, type ErrorInfo, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import Button from './ui/Button'
import { buttonClass } from './ui/buttonClass'

interface Props {
  children: ReactNode
  // Changing this clears a caught error (e.g. the route path: navigating away
  // from a broken page shows the next page instead of the error screen).
  resetKey?: unknown
}

interface State {
  error: Error | null
  resetKey: unknown
}

// Catches errors thrown while rendering (a crash in the 3D or 2D editor, say)
// and shows a way out instead of a blank page. Errors in event handlers and
// async code don't reach here; those surface as toasts.
export default class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console -- the developer's only trace of a render crash
    console.error('Render error:', error, info.componentStack)
  }

  override render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div role="alert" className="min-h-screen flex items-center justify-center bg-app p-6">
        <div className="max-w-md w-full rounded-xl border border-solid border-line bg-surface p-8 text-center">
          <TriangleAlert className="mx-auto mb-4 h-10 w-10 text-danger" aria-hidden />
          <h1 className="text-xl font-semibold text-ink mb-2">Something went wrong</h1>
          <p className="text-sm text-muted mb-6">
            This page ran into a problem and couldn't continue. Your last saved work is safe.
          </p>
          {import.meta.env.DEV && (
            <pre className="mb-6 max-h-40 overflow-auto rounded-lg bg-field p-3 text-left text-xs text-muted">
              {error.message}
            </pre>
          )}
          <div className="flex justify-center gap-3">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload page
            </Button>
            <a href="/dashboard" className={buttonClass('secondary')}>
              Back to dashboard
            </a>
          </div>
        </div>
      </div>
    )
  }
}
