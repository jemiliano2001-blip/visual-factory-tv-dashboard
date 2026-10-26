import type { NextFunction, Request, Response } from 'express';
import { esTokenAnonimo } from './firebaseTokenPolicy';

/**
 * Guard único para /api (server.ts y la Cloud Function `api`).
 * `verify` valida el ID token con Google y devuelve si es válido; la política de
 * cuenta real (no anónima) se aplica aquí para que ambos backends sean iguales.
 * Sin token o token inválido → 401. Token válido pero anónimo → 403.
 */
export function createApiAuthGuard(
  verify: (token: string) => Promise<boolean>,
  opts: { bypass?: (req: Request) => boolean } = {},
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (opts.bypass?.(req)) {
      next();
      return;
    }
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      res.status(401).json({ error: 'Se requiere autenticación.' });
      return;
    }
    let valid = false;
    try {
      valid = await verify(token);
    } catch {
      valid = false;
    }
    if (!valid) {
      res.status(401).json({ error: 'Token inválido o expirado. Vuelve a iniciar sesión.' });
      return;
    }
    if (esTokenAnonimo(token)) {
      res.status(403).json({ error: 'Se requiere una cuenta de personal SMV; las sesiones anónimas no tienen acceso.' });
      return;
    }
    next();
  };
}
