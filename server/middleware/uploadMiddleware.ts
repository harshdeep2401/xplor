import type { RequestHandler } from 'express'
import multer from 'multer'
import { BadRequestError } from '../errors'

// A rejected upload (wrong file type) is the client's mistake: a 400 with code
// INVALID_FILE_TYPE. Too-large files are a multer error the handler maps to 413.
export class UploadError extends BadRequestError {
  constructor(message: string, code = 'INVALID_FILE_TYPE') {
    super(message, code)
  }
}

// The first bytes of each file type we accept. The file filters below only see
// the name and the type the browser claims; this checks the bytes themselves,
// so a renamed executable or HTML page can't be stored as a ".png".
const SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  png: (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  glb: (b) => b.toString('latin1', 0, 4) === 'glTF',
}

// What the upload says it is: its extension, else its MIME type.
function claimedKind(file: Express.Multer.File): string | null {
  const ext = file.originalname.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  if (ext === 'glb') return 'glb'
  if (ext === 'png' || file.mimetype === 'image/png') return 'png'
  if (ext === 'jpg' || ext === 'jpeg' || file.mimetype === 'image/jpeg') return 'jpeg'
  if (ext === 'webp' || file.mimetype === 'image/webp') return 'webp'
  if (file.mimetype === 'model/gltf-binary') return 'glb'
  return null
}

// After multer: the uploaded bytes must really be the type they claim to be.
export const checkFileContent: RequestHandler = (req, _res, next) => {
  if (!req.file) {
    next()
    return
  }
  const kind = claimedKind(req.file)
  if (!kind || !SIGNATURES[kind](req.file.buffer)) {
    next(
      new UploadError(
        "The file's contents don't match its type. Upload a real PNG, JPG, WEBP or GLB file.",
        'INVALID_FILE_CONTENT',
      ),
    )
    return
  }
  next()
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
