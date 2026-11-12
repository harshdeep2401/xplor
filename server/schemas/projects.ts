import { z } from 'zod'
import {
  validateCanvasV2,
  validateSceneV1,
  type CanvasV2,
  type SceneV1,
} from '../services/converter'
import { contract, jsonObject } from './common'

// Canvas size: pixels for 2D projects, metres for 3D ones (the room size). The
// column is an integer, so fractional metres are rounded.
const size = z
  .number({ error: 'Size must be a number.' })
  .positive('Size must be greater than 0.')
  .max(100_000, 'Size is too large.')
  .transform(Math.round)
  .pipe(z.number().min(1, 'Size must be at least 1.'))

export const createProjectBody = z.object({
  name: z
    .string()
    .trim()
    .max(120, 'Project name must be at most 120 characters.')
    .optional()
    .transform((n) => n || 'Untitled Floor Plan'),
  canvasWidth: size.optional(),
  canvasHeight: size.optional(),
  type: z.enum(['2d', '3d'], { error: 'Project type must be "2d" or "3d".' }).default('2d'),
})
export type CreateProjectBody = z.infer<typeof createProjectBody>

// The 2D editor saves its drawing as canvas-v2.
export const saveProjectBody = z.object({
  canvas: contract<CanvasV2>(validateCanvasV2, 'canvas-v2'),
})
export type SaveProjectBody = z.infer<typeof saveProjectBody>

export const saveSceneBody = z.object({
  sceneData: contract<SceneV1>(validateSceneV1, 'scene-v1'),
  // Editor-only settings, e.g. the grid size of a plan-less 3D project.
  metadata: jsonObject.optional(),
  // The version the editor loaded; a mismatch means someone saved since (409).
  baseVersion: z.number().int().min(0).optional(),
})
export type SaveSceneBody = z.infer<typeof saveSceneBody>

export const suggestionsBody = z.object({
  scene: contract<SceneV1>(validateSceneV1, 'scene-v1'),
  roomId: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(20).optional(),
})
export type SuggestionsBody = z.infer<typeof suggestionsBody>
