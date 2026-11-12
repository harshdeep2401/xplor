// Files the server stores or ships (/uploads/..., /static/...) are served from
// the API's origin (e.g. http://localhost:5001/uploads/…), while VITE_API_URL
// carries the /api prefix. Absolute URLs (R2 later, external links) pass through.
export function resolveServerUrl(url: string): string {
  if (/^(https?:|blob:|data:)/i.test(url)) return url
  return new URL(url, import.meta.env.VITE_API_URL).toString()
}
