// The server's one logger (pino). Everything logs through it, never console:
//   logger.info({ jobId }, 'AI call finished')   — the object holds the facts,
//                                                  the string says what happened.
// Inside a request, use req.log instead: same logger, tagged with the
// request's id, so every line from one request can be found together.
//
// Development: readable, coloured, one line per request. Production: one JSON
// object per line, all fields kept (for the host's log viewer). Level from
// LOG_LEVEL (config/env.ts).
import pino, { type LoggerOptions } from 'pino'
import { env } from './env'

// Never written to the logs, wherever they appear in a logged object. pino
// replaces the value with "[redacted]".
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'secret',
  '*.password',
  '*.token',
  '*.secret',
  '*.authorization',
  '*.privateKey',
]

export function loggerOptions(level: string = env.LOG_LEVEL): LoggerOptions {
  return {
    level,
    base: { service: 'xplor-api' },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    // ISO timestamps read the same in every log viewer.
    timestamp: pino.stdTimeFunctions.isoTime,
  }
}

const pretty = env.NODE_ENV === 'development'

export const logger = pino({
  ...loggerOptions(),
  ...(pretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname,service,req,res,responseTime',
          },
        },
      }
    : {}),
})
