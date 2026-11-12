import { LoaderCircle } from 'lucide-react'

// Shown while a page's code is downloading (pages load on first visit).
export default function PageLoader() {
  return (
    <div
      role="status"
      className="flex min-h-screen items-center justify-center gap-3 bg-app text-ink-soft"
    >
      <LoaderCircle className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      Loading…
    </div>
  )
}
