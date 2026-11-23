/**
 * Rate limiter de ventana deslizante en memoria para rutas Express (/api/*).
 * Lógica pura sin dependencias externas (compartida por server.ts y functions/).
 */

export interface RateLimitReq {
  ip?: string;
}

export interface RateLimitRes {
  setHeader(name: string, value: string): void;
  status(code: number): { json(body: unknown): unknown };
  locals: Record<string, unknown>;
}

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  maxKeys?: number;
  now?: () => number;
  keyOf?: (req: RateLimitReq, res: RateLimitRes) => string;
}

function defaultKeyOf(req: RateLimitReq, res: RateLimitRes): string {
  const actor = res.locals.actor as { uid?: unknown } | undefined;
  if (actor && typeof actor.uid === 'string' && actor.uid) return actor.uid;
  return req.ip ?? 'anon';
}

export function createMemoryRateLimiter(opts: RateLimiterOptions) {
  const maxRequests = Math.max(1, opts.maxRequests);
  const windowMs = Math.max(1, opts.windowMs);
  const maxKeys = opts.maxKeys ?? 500;
  const now = opts.now ?? Date.now;
  const keyOf = opts.keyOf ?? defaultKeyOf;
  const hits = new Map<string, number[]>();

  return (req: RateLimitReq, res: RateLimitRes, next: () => void): void => {
    const t = now();
    const key = keyOf(req, res);
    const recent = (hits.get(key) ?? []).filter(ts => t - ts < windowMs);
    if (recent.length >= maxRequests) {
      const oldest = recent[0] ?? t;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - t) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un minuto.' });
      return;
    }
    recent.push(t);
    if (!hits.has(key) && hits.size >= maxKeys) {
      for (const [k, timestamps] of hits) {
        if (timestamps.every(ts => t - ts >= windowMs)) hits.delete(k);
      }
      if (hits.size >= maxKeys) {
        const oldestKey = hits.keys().next().value;
        if (oldestKey !== undefined) hits.delete(oldestKey);
      }
    }
    hits.set(key, recent);
    next();
  };
}
