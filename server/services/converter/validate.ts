import fs from 'fs'
import path from 'path'
import Ajv2020, { type ValidateFunction, type ErrorObject } from 'ajv/dist/2020'
import type { CanvasV2, SceneV1 } from './types'

// Runtime validation against the JSON Schema contracts — the schemas in
// /contracts are the single source of truth; we compile them here rather than
// redefining the shapes. Both boundaries of the converter are checked: the
// normalized canvas going in, and the scene coming out.
//
// __dirname is server/services/converter; the contracts dir is three levels up.
const CONTRACTS_DIR = path.join(__dirname, '..', '..', '..', 'contracts')

function loadSchema(file: string): object {
  return JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, file), 'utf8'))
}

// strict:false — our schemas use only standard keywords, but this avoids ajv
// throwing on benign meta constructs (e.g. `default`, https `$id`).
const ajv = new Ajv2020({ allErrors: true, strict: false })

export const validateCanvasV2: ValidateFunction<CanvasV2> = ajv.compile<CanvasV2>(
  loadSchema('canvas-v2.schema.json'),
)
export const validateSceneV1: ValidateFunction<SceneV1> = ajv.compile<SceneV1>(
  loadSchema('scene-v1.schema.json'),
)

// Compact, human-readable summary of ajv errors for error messages/logs.
export function formatErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'unknown validation error'
  return errors
    .map((e) => `${e.instancePath || '(root)'} ${e.message ?? ''}`.trim())
    .join('; ')
}
