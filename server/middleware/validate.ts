import type { RequestHandler } from 'express'
import { z } from 'zod'

// Checks a request's params, query and body against Zod schemas before the
// handler runs. Parsed values replace the raw ones, so handlers get clean,
// typed input (trimmed strings, defaults filled in). On failure every problem
// is collected into one ZodError, which middleware/errorHandler.ts turns into
// a 400 VALIDATION_FAILED.
//
//   router.post('/', validate({ body: createProjectBody }), createProject)
export interface RequestSchemas {
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
}

export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req, _res, next) => {
    const issues: z.ZodError['issues'] = []
    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part]
      if (!schema) continue
      const result = schema.safeParse(req[part])
      if (!result.success) {
        issues.push(...result.error.issues.map((i) => ({ ...i, path: [part, ...i.path] })))
      } else if (part === 'query') {
        // Express 5 makes req.query a getter; shadow it with the parsed value.
        Object.defineProperty(req, 'query', { value: result.data, configurable: true })
      } else {
        req[part] = result.data
      }
    }
    if (issues.length) {
      next(new z.ZodError(issues))
      return
    }
    next()
  }
