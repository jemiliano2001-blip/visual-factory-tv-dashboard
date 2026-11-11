/**
 * Lista de solo lectura de quién tiene acceso al dashboard (según SMV Hub) y quién puede
 * editar horarios (claim `admin` de Firebase Auth). Lógica pura: la salida no incluye
 * uids ni correos.
 */
import { evaluarAccesoHub, HUB_BREAK_GLASS_EMAIL } from './hubAccess';

export interface TeamMember { name: string; active: boolean; canEditSchedules: boolean }
export interface TeamAccessResponse { available: boolean; members: TeamMember[] }
export interface HubUserDoc { uid: string; data: unknown }
export interface AuthUserInfo {
  uid: string;
  email: string | null;
  displayName: string | null;
  customClaims?: Record<string, unknown> | null;
}

export const isAdminClaim = (claims: Record<string, unknown> | null | undefined): boolean => claims?.admin === true;

export function buildTeamAccess(hubDocs: readonly HubUserDoc[], authUsers: readonly AuthUserInfo[]): TeamMember[] {
  const hub = new Map(hubDocs.map(d => [d.uid, d.data]));
  const auth = new Map(authUsers.map(u => [u.uid, u]));
  // El proyecto Firebase es compartido (Hub, Vision, sesiones antiguas): de Auth solo cuentan
  // quienes ya están en el Hub, los editores (claim admin) y la cuenta break-glass.
  const relevantAuth = authUsers
    .filter(u => isAdminClaim(u.customClaims) || u.email?.trim().toLowerCase() === HUB_BREAK_GLASS_EMAIL)
    .map(u => u.uid);
  const uids = new Set([...hub.keys(), ...relevantAuth]);

  const members = [...uids].map((uid): TeamMember => {
    const user = auth.get(uid);
    const doc = hub.get(uid);
    const access = evaluarAccesoHub(doc, user?.email ?? null);
    // evaluarAccesoHub no da nombre a cuentas inactivas: se lee del documento.
    const hubName = typeof (doc as { operadorNombre?: unknown } | null)?.operadorNombre === 'string'
      ? (doc as { operadorNombre: string }).operadorNombre.trim() : '';
    return {
      name: hubName || user?.displayName?.trim() || 'Sin nombre',
      active: access.allowed,
      canEditSchedules: isAdminClaim(user?.customClaims),
    };
  });

  return members.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es-MX'));
}

/** Interpreta la respuesta de /api/team-access; lanza Error en español ante cualquier fallo. */
export async function parseTeamAccessResponse(response: Response): Promise<TeamAccessResponse> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error || `Error HTTP ${response.status}`);
  }
  const body = await response.json().catch(() => null) as Partial<TeamAccessResponse> | null;
  if (!body || typeof body.available !== 'boolean' || !Array.isArray(body.members)) {
    throw new Error('Respuesta inesperada del servidor.');
  }
  return { available: body.available, members: body.members };
}
