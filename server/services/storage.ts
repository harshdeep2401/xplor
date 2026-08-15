import fs from 'fs'
import path from 'path'

// Blob-storage abstraction. Today it writes to local disk under server/uploads
// (served statically at /uploads — see server.ts). To move to Cloudflare R2 / S3,
// reimplement putObject + getPublicUrl here; callers (controllers) don't change.
//
// storage.ts lives in server/services, so ".." is the server root.
const STORAGE_ROOT = path.join(__dirname, '..', 'uploads')

export interface PutObjectArgs {
  // Path under the storage root, e.g. "floor-plans/<userId>/<file>"
  key: string
  body: Buffer
  // Unused by the local-disk backend; the R2/S3 backend will set it.
  contentType?: string
}

// Persist an object and return its public URL.
export async function putObject({ key, body }: PutObjectArgs): Promise<string> {
  const dest = path.join(STORAGE_ROOT, key)
  await fs.promises.mkdir(path.dirname(dest), { recursive: true })
  await fs.promises.writeFile(dest, body)
  return getPublicUrl(key)
}

// Public URL for a stored object. Local disk → served at /uploads; later this
// becomes the R2 public-domain URL.
export function getPublicUrl(key: string): string {
  return `/uploads/${key}`
}

// Build the storage key for a user's floor-plan upload (sanitizes the filename).
export function floorPlanKey(userId: string, originalName: string): string {
  const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  return `floor-plans/${userId}/${Date.now()}-${safeName}`
}

// Storage key for a project's exported GLB (timestamped so each export is distinct).
export function glbKey(projectId: string): string {
  return `glb/${projectId}/${Date.now()}.glb`
}

// Delete a stored object. No-op if it's already gone (force). Used when pruning
// old GLB exports.
export async function deleteObject(key: string): Promise<void> {
  const dest = path.join(STORAGE_ROOT, key)
  await fs.promises.rm(dest, { force: true })
}

// Reverse of getPublicUrl for the local-disk backend: recover the storage key
// from a public URL so a caller that only knows the URL can delete the object.
// Returns null for URLs this backend didn't mint (e.g. absolute R2 URLs later).
export function keyFromPublicUrl(url: string): string | null {
  const prefix = '/uploads/'
  return url.startsWith(prefix) ? url.slice(prefix.length) : null
}
