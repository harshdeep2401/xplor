import type { SceneV1 } from './types'
import { normalizeCanvas, type CanvasDefaults } from './normalizeCanvas'
import { convertToScene } from './convertToScene'
import { validateCanvasV2, validateSceneV1, formatErrors } from './validate'

export * from './types'
export { normalizeCanvas, type CanvasDefaults } from './normalizeCanvas'
export { convertToScene } from './convertToScene'
export { validateCanvasV2, validateSceneV1 } from './validate'

// Thrown when the canvas going in or the scene coming out fails schema validation.
export class ConverterError extends Error {
  constructor(message: string, public readonly details: string) {
    super(`${message}: ${details}`)
    this.name = 'ConverterError'
  }
}

// Full deterministic pipeline: a raw stored canvas (legacy canvas-v1 or already
// canvas-v2) -> validated canvas-v2 -> canonical scene-v1 (also validated).
// Same input always yields an identical scene. `defaults` supplies per-project
// scale/height for legacy canvases (ignored when the canvas is already v2).
export function convertCanvasToScene(rawCanvas: unknown, defaults: CanvasDefaults = {}): SceneV1 {
  const canvas = normalizeCanvas(rawCanvas, defaults)

  if (!validateCanvasV2(canvas)) {
    throw new ConverterError(
      'normalized canvas failed canvas-v2 validation',
      formatErrors(validateCanvasV2.errors),
    )
  }

  const scene = convertToScene(canvas)

  if (!validateSceneV1(scene)) {
    throw new ConverterError(
      'converted scene failed scene-v1 validation',
      formatErrors(validateSceneV1.errors),
    )
  }

  return scene
}
