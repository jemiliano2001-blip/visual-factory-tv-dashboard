/**
 * Política de sesión del proxy /api: el ID token ya fue validado por Google (accounts:lookup);
 * aquí solo se decide si pertenece a una sesión anónima. Falla cerrado: si no se puede leer el
 * proveedor de inicio de sesión, se trata como anónimo.
 */
export function esTokenAnonimo(token: string): boolean {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      firebase?: { sign_in_provider?: unknown };
    };
    const proveedor = payload.firebase?.sign_in_provider;
    return typeof proveedor !== 'string' || proveedor === 'anonymous';
  } catch {
    return true;
  }
}

export interface TokenActor { uid: string; email: string | null; name: string | null }

/** Identidad del llamador a partir del payload del token; null si es anónimo o ilegible (falla cerrado). */
export function identidadDeToken(token: string): TokenActor | null {
  if (esTokenAnonimo(token)) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
    const uid = texto(payload.user_id) ?? texto(payload.sub);
    return uid ? { uid, email: texto(payload.email), name: texto(payload.name) } : null;
  } catch {
    return null;
  }
}

type AuthReq = { headers: { authorization?: string } };
type AuthRes = { status(code: number): { json(body: unknown): unknown }; locals: Record<string, unknown> };

/** Middleware de /api: exige token válido y no anónimo; deja la identidad en res.locals.actor. */
export function crearAuthApi(verificar: (token: string) => Promise<boolean>) {
  return async (req: AuthReq, res: AuthRes, next: () => void): Promise<void> => {
    const token = (req.headers.authorization ?? '').replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Se requiere autenticación.' }); return; }
    if (!(await verificar(token))) { res.status(401).json({ error: 'Token inválido o expirado. Vuelve a iniciar sesión.' }); return; }
    const actor = identidadDeToken(token); // null si es anónimo, ilegible o sin uid: falla cerrado
    if (!actor) {
      res.status(403).json({ error: 'Se requiere una cuenta de personal SMV; las sesiones anónimas no tienen acceso.' });
      return;
    }
    res.locals.actor = actor;
    next();
  };
}
