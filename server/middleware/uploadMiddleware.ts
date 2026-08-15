import multer from 'multer'

// Floor-plan uploads are buffered in memory, then persisted via the storage
// module (services/storage.ts). Keeping the disk/bucket write in one place
// means switching to R2/S3 later is a single-file change there — the route and
// controller stay the same.

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'))
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

const glbFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (GLB_MIME_TYPES.includes(file.mimetype) || file.originalname.endsWith('.glb')) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Expected a .glb model.'))
  }
}

export const uploadGlb = multer({
  storage: multer.memoryStorage(),
  fileFilter: glbFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
})
