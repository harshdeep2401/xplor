import type { ValidateFunction } from 'ajv'
import { z } from 'zod'
import { formatErrors } from '../services/converter'

// Database ids (cuid) and catalog ids ("kenney-sofa").
export const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Invalid id')

export const idParams = z.object({ id })
export type IdParams = z.infer<typeof idParams>

// Free-form JSON object (stored as-is in a JSON column).
export const jsonObject = z.record(z.string(), z.unknown())

// Bridge from a JSON Schema contract (contracts/*.schema.json, checked by Ajv)
// into Zod, so request schemas can say "this field is a scene-v1" and report
// contract errors the same way as any other validation error. The contracts
// stay in JSON Schema because the Python AI service shares them.
export function contract<T>(validate: ValidateFunction<T>, name: string) {
  return z
    .unknown()
    .superRefine((value, ctx) => {
      if (!validate(value)) {
        ctx.addIssue({
          code: 'custom',
          message: `must be a valid ${name}: ${formatErrors(validate.errors)}`,
        })
      }
    })
    .transform((value) => value as T)
}
