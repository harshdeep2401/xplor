// The errors a request can end in. Controllers and middleware `throw` these;
// Express 5 passes thrown (and rejected async) errors to the one error handler
// (middleware/errorHandler.ts), which turns them into the response
//
//   { message, code, details? }
//
// `message` is shown to the user, so it's a sentence. `code` is stable and
// machine-readable (the client can branch on it). `details` is optional
// structured context: validation problems, the current scene version, a job id.

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = new.target.name
  }
}

// 400: the request itself is wrong (bad input, missing file).
export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST', details?: unknown) {
    super(400, code, message, details)
  }
}

// 401: not signed in, or the session is no longer valid. The client signs the
// user out on this status, so use it only for authentication problems.
export class UnauthorizedError extends AppError {
  constructor(message = 'Please sign in to continue.', code = 'UNAUTHORIZED') {
    super(401, code, message)
  }
}

// 404: doesn't exist, or isn't the caller's (never confirm someone else's ids).
export class NotFoundError extends AppError {
  constructor(message = 'Not found.', code = 'NOT_FOUND', details?: unknown) {
    super(404, code, message, details)
  }
}

// 409: clashes with the current state (stale version, already exists).
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT', details?: unknown) {
    super(409, code, message, details)
  }
}

// 413: an upload or body over the size limit.
export class PayloadTooLargeError extends AppError {
  constructor(message = 'That is too large to upload.', code = 'PAYLOAD_TOO_LARGE') {
    super(413, code, message)
  }
}

// 429: too many requests in a short time (middleware/security.ts).
export class TooManyRequestsError extends AppError {
  constructor(message: string, code = 'RATE_LIMITED') {
    super(429, code, message)
  }
}

// 422: well-formed, but can't be processed (e.g. a plan that won't convert).
export class UnprocessableError extends AppError {
  constructor(message: string, code = 'UNPROCESSABLE', details?: unknown) {
    super(422, code, message, details)
  }
}

// 503: a feature that depends on something not available right now.
export class ServiceUnavailableError extends AppError {
  constructor(message: string, code = 'SERVICE_UNAVAILABLE') {
    super(503, code, message)
  }
}
