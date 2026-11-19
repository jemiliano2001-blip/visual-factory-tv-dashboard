/**
 * Política de sesión del proxy /api: el ID token ya fue validado por Google (accounts:lookup);
 * aquí solo se decide si pertenece a una sesión anónima. Falla cerrado: si no se puede leer el
 * proveedor de inicio de sesión, se trata como anónimo.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const raw = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as unknown;
    return typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function extractBearerToken(authorization?: string): string {
  const match = (authorization ?? '').match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export function esTokenAnonimo(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;
  const firebase = payload.firebase as { sign_in_provider?: unknown } | undefined;
  const proveedor = firebase?.sign_in_provider;
  return typeof proveedor !== 'string' || proveedor === 'anonymous';
}

export function esEmailVerificado(token: string): boolean {
  const payload = decodeJwtPayload(token);
  return payload?.email_verified === true;
}

export interface TokenActor { uid: string; email: string | null; name: string | null }

/** Identidad del llamador a partir del payload del token; null si es anónimo o ilegible (falla cerrado). */
export function identidadDeToken(token: string): TokenActor | null {
  if (esTokenAnonimo(token)) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const uid = texto(payload.user_id) ?? texto(payload.sub);
  return uid ? { uid, email: texto(payload.email), name: texto(payload.name) } : null;
}

type AuthReq = { headers: { authorization?: string } };
type AuthRes = { status(code: number): { json(body: unknown): unknown }; locals: Record<string, unknown> };

/** Middleware de /api: exige token válido y no anónimo; deja la identidad en res.locals.actor. */
export function crearAuthApi(verificar: (token: string) => Promise<boolean>) {
  return async (req: AuthReq, res: AuthRes, next: () => void): Promise<void> => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) { res.status(401).json({ error: 'Se requiere autenticación.' }); return; }
    let verified = false;
    try {
      verified = await verificar(token);
    } catch {
      verified = false;
    }
    if (!verified) { res.status(401).json({ error: 'Token inválido o expirado. Vuelve a iniciar sesión.' }); return; }
    const actor = identidadDeToken(token); // null si es anónimo, ilegible o sin uid: falla cerrado
    if (!actor) {
      res.status(403).json({ error: 'Se requiere una cuenta de personal SMV; las sesiones anónimas no tienen acceso.' });
      return;
    }
    res.locals.actor = actor;
    next();
  };
}
