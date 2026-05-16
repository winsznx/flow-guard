/**
 * Structured request logging middleware.
 *
 * Each request gets a stable `req.requestId` (echoed back in `x-request-id`
 * response header) so the access log line, the application logs that occur
 * during handling, and any subsequent operator-side error reports can all be
 * correlated.
 *
 * Logs are emitted as one JSON line per event so they can be ingested by any
 * structured-log pipeline (Datadog, Loki, Cloud Logging) without parsing rules.
 *
 * Pre-fix the codebase used scattered `console.error('[ERROR]', { ... })`
 * calls. That's fine for one engineer reading raw text, but it doesn't survive
 * the first incident with a paying customer.
 */

import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      startTimeMs?: number;
    }
  }
}

export interface StructuredLogFields {
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

function emit(level: 'info' | 'warn' | 'error', message: string, fields: StructuredLogFields): void {
  const line = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...fields,
  };
  // process.stdout.write keeps order across async events better than console.log
  process.stdout.write(JSON.stringify(line) + '\n');
}

export const log = {
  info(message: string, fields: StructuredLogFields = {}): void {
    emit('info', message, fields);
  },
  warn(message: string, fields: StructuredLogFields = {}): void {
    emit('warn', message, fields);
  },
  error(message: string, fields: StructuredLogFields = {}): void {
    emit('error', message, fields);
  },
};

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const incoming = (req.headers['x-request-id'] || req.headers['x-correlation-id']) as string | undefined;
  const requestId = typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
    ? incoming
    : randomUUID();

  req.requestId = requestId;
  req.startTimeMs = Date.now();

  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Date.now() - (req.startTimeMs ?? Date.now());
    const fields: StructuredLogFields = {
      requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs,
    };
    if (req.verifiedUser?.address) {
      fields.callerAddress = req.verifiedUser.address;
    }
    if (res.statusCode >= 500) {
      log.error('http.request', fields);
    } else if (res.statusCode >= 400) {
      log.warn('http.request', fields);
    } else {
      log.info('http.request', fields);
    }
  });

  next();
}
