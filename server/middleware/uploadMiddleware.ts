import fs from 'fs'
import path from 'path'
import multer from 'multer'

// All uploads land under server/uploads/floor-plans/<userId>/...
// This is local-disk storage for the prototype. When R2/S3 is introduced
// later, only this file needs to change (swap diskStorage for a memoryStorage + upload-to-bucket step) — routes/controllers stay the same.
export const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads', 'floor-plans')

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const userDir = path.join(UPLOAD_ROOT, req.user!.id)
      fs.mkdirSync(userDir, { recursive: true })
      cb(null, userDir)
    } catch (err) {
      cb(err as Error, '')
    }
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    cb(null, `${Date.now()}-${safeName}`)
  },
})

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, and WEBP images are allowed.'))
  }
}

export const uploadFloorPlan = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})
