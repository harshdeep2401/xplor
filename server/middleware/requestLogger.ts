import { randomUUID } from 'crypto'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Request } from 'express'
import type { Logger } from 'pino'
import { pinoHttp } from 'pino-http'

// Request ids: a caller (a proxy, the client) may send its own X-Request-Id to
// tie logs together; anything that doesn't look like an id is replaced.
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/

// The full path: inside a router Express shortens req.url ("/register").
const pathOf = (req: IncomingMessage) => (req as Request).originalUrl ?? req.url

// One log line per finished request — method, path, status, time, user and
// request id; never headers or bodies — and `req.log` for handlers. Every
// response carries X-Request-Id, so a user reporting a problem can quote it.
export function requestLogger(logger: Logger) {
  return pinoHttp({
    logger,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const incoming = req.headers['x-request-id']
      const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID()
      res.setHeader('X-Request-Id', id)
      return id
    },
    // Health probes run every few seconds; logging them only buries real traffic.
    autoLogging: { ignore: (req) => req.url === '/live' || req.url === '/ready' },
    customLogLevel(_req, res, err) {
      if (err || res.statusCode >= 500) return 'error'
      if (res.statusCode >= 400) return 'warn'
      return 'info'
    },
    customSuccessMessage: (req, res, ms) =>
      `${req.method} ${pathOf(req)} ${res.statusCode} ${Math.round(ms)}ms`,
    customErrorMessage: (req, res) => `${req.method} ${pathOf(req)} ${res.statusCode} failed`,
    // Who made the request (set by `protect`), read when the request finishes.
    customProps: (req) => {
      const user = (req as Request).user
      return user ? { userId: user.id } : {}
    },
    serializers: {
      req: (req: { id: string; method: string; url: string; raw?: Request }) => ({
        id: req.id,
        method: req.method,
        url: req.raw?.originalUrl ?? req.url,
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  })
}
