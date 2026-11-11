import type { ErrorRequestHandler, RequestHandler } from 'express'
import multer from 'multer'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { env } from '../config/env'
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  PayloadTooLargeError,
} from '../errors'

// The single place that turns errors into responses. Everything else throws
// (see errors/index.ts); nothing else calls res.status(4xx/5xx).

// Unmatched routes.
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new NotFoundError(`No API route for ${req.method} ${req.path}.`, 'ROUTE_NOT_FOUND'))
}

// Map anything thrown to an AppError. Known library errors get a proper status;
// the rest is a 500 whose real message stays in the server log.
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err

  // A request that failed its schema (middleware/validate.ts).
  if (err instanceof z.ZodError) {
    return new BadRequestError(
      err.issues[0]?.message ?? 'Invalid request.',
      'VALIDATION_FAILED',
      err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    )
  }

  // Uploads (multer): too big, too many, or an unexpected field.
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return new PayloadTooLargeError('That file is too large to upload.', 'FILE_TOO_LARGE')
    }
    return new BadRequestError(err.message, 'INVALID_UPLOAD')
  }

  // express.json(): malformed JSON or a body over the limit.
  const type = (err as { type?: unknown } | null)?.type
  if (type === 'entity.parse.failed') {
    return new BadRequestError('The request body is not valid JSON.', 'INVALID_JSON')
  }
  if (type === 'entity.too.large') {
    return new PayloadTooLargeError('The request is too large.', 'BODY_TOO_LARGE')
  }

  // Database: a record that vanished mid-request, or a unique clash.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return new NotFoundError()
    if (err.code === 'P2002') {
      return new ConflictError('That conflicts with a change saved at the same time. Try again.')
    }
  }

  const internal = new AppError(
    500,
    'INTERNAL_ERROR',
    // Development shows the real cause; production never leaks internals.
    env.NODE_ENV === 'production' || !(err instanceof Error)
      ? 'Something went wrong on our side. Please try again.'
      : err.message,
    undefined,
    { cause: err },
  )
  return internal
}

export function errorBody(error: AppError) {
  return {
    message: error.message,
    code: error.code,
    ...(error.details === undefined ? {} : { details: error.details }),
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  const error = toAppError(err)
  if (error.status >= 500) {
    // The request log line (middleware/requestLogger.ts) carries the error and
    // its stack; the client only ever sees the safe message.
    res.err = err instanceof Error ? err : new Error(String(err))
  } else if (error.status !== 404) {
    req.log?.debug({ code: error.code, details: error.details }, error.message)
  }
  // Too late to send a JSON error (a stream was half sent): let Express close it.
  if (res.headersSent) {
    next(err)
    return
  }
  res.status(error.status).json(errorBody(error))
}
