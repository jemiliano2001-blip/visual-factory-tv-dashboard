/**
 * Acceso al dashboard según SMV Hub (mismo proyecto Firebase): la cuenta debe tener un
 * documento `usuarios/{uid}` con `activo === true`. El nombre que se muestra es el del
 * operador vinculado en el Hub. Lógica pura, sin imports.
 */

/** Debe coincidir con CORREO_ADMIN_BREAK_GLASS del Hub: entra aunque no tenga documento. */
export const HUB_BREAK_GLASS_EMAIL = 'jemiliano2001@gmail.com';

export interface HubAccess { allowed: boolean; name?: string | null }

export function evaluarAccesoHub(doc: unknown, email: string | null): HubAccess {
  if (email && email.trim().toLowerCase() === HUB_BREAK_GLASS_EMAIL) {
    const n = typeof (doc as { operadorNombre?: unknown } | null)?.operadorNombre === 'string'
      ? (doc as { operadorNombre: string }).operadorNombre.trim() : '';
    return { allowed: true, name: n || null };
  }
  if (typeof doc !== 'object' || doc === null || Array.isArray(doc)) return { allowed: false };
  const d = doc as { activo?: unknown; operadorNombre?: unknown };
  if (d.activo !== true) return { allowed: false };
  const name = typeof d.operadorNombre === 'string' ? d.operadorNombre.trim() : '';
  return { allowed: true, name: name || null };
}

/** Verificador con caché por uid (TTL corto: desactivar a alguien en el Hub surte efecto en ~1 min). */
export function crearVerificadorHub(
  leerUsuario: (uid: string) => Promise<unknown>,
  opts: { ttlMs?: number; now?: () => number } = {},
) {
  const ttlMs = opts.ttlMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const cache = new Map<string, { at: number; value: HubAccess }>();
  return async (uid: string, email: string | null): Promise<HubAccess> => {
    const hit = cache.get(uid);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = evaluarAccesoHub(await leerUsuario(uid), email); // si falla la lectura, propaga: no se cachea
    cache.set(uid, { at: now(), value });
    return value;
  };
}
