/**
 * Correlación de requests HTTP (`X-Request-Id`) y logging estructurado sin PII.
 * Compartido entre `server.ts` y `functions/src/index.ts`.
 */
import { randomUUID } from 'node:crypto';

const REQUEST_ID_RE = /^[A-Za-z0-9._-]{8,64}$/;

export interface RequestLogInfo {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  actorUid: string | null;
}

export interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  path?: string;
  originalUrl?: string;
}

export interface ResponseLike {
  statusCode: number;
  locals: Record<string, unknown>;
  setHeader(name: string, value: string): void;
  on(event: 'finish', listener: () => void): void;
}

export function resolveRequestId(headerValue: string | string[] | undefined): string {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (REQUEST_ID_RE.test(trimmed)) return trimmed;
  }
  return randomUUID();
}

function cleanPath(req: RequestLike): string {
  const raw = req.path ?? req.originalUrl ?? '/';
  const qIndex = raw.indexOf('?');
  return (qIndex >= 0 ? raw.slice(0, qIndex) : raw).slice(0, 128);
}

export function createRequestContextMiddleware(onFinish?: (info: RequestLogInfo) => void) {
  return (req: RequestLike, res: ResponseLike, next: () => void): void => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    if (onFinish) {
      const startedAt = Date.now();
      res.on('finish', () => {
        const actor = res.locals.actor as { uid?: unknown } | undefined;
        const actorUid = actor && typeof actor.uid === 'string' && actor.uid ? actor.uid : null;
        onFinish({
          requestId,
          method: String(req.method ?? 'GET').toUpperCase(),
          path: cleanPath(req),
          statusCode: res.statusCode,
          durationMs: Math.max(0, Date.now() - startedAt),
          actorUid,
        });
      });
    }

    next();
  };
}
