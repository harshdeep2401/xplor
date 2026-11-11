import multer from 'multer'

// A rejected upload (wrong file type) is the client's mistake: the central error
// handler in server.ts answers it with this status instead of 500.
export class UploadError extends Error {
  readonly status = 400
}

// Floor-plan uploads are buffered in memory, then persisted via the storage
// module (services/storage.ts). Keeping the disk/bucket write in one place
// means switching to R2/S3 later is a single-file change there — the route and
// controller stay the same.

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new UploadError('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'))
  }
}

export const uploadFloorPlan = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})

// GLB exports of the 3D scene. Buffered in memory, then persisted + pruned via
// the storage module and conversionController.
const GLB_MIME_TYPES = ['model/gltf-binary', 'application/octet-stream']

const glbFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  if (GLB_MIME_TYPES.includes(file.mimetype) || file.originalname.endsWith('.glb')) {
    cb(null, true)
  } else {
    cb(new UploadError('Invalid file type. Expected a .glb model.'))
  }
}

export const uploadGlb = multer({
  storage: multer.memoryStorage(),
  fileFilter: glbFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})

// Files the 3D editor brings in from the user's disk: GLB models and texture
// images. Stored so a saved scene can point at them by URL (roadmap 6.1).
const PROJECT_FILE_TYPES: Record<string, string[]> = {
  '.glb': ['model/gltf-binary', 'application/octet-stream'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
}

const projectFileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = file.originalname.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? ''
  if (
    PROJECT_FILE_TYPES[ext]?.includes(file.mimetype) ||
    (ext === '.glb' && file.mimetype === '')
  ) {
    cb(null, true)
  } else {
    cb(new UploadError('Invalid file type. Expected a .glb model or a PNG, JPG or WEBP image.'))
  }
}

export const uploadProjectFile = multer({
  storage: multer.memoryStorage(),
  fileFilter: projectFileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})
