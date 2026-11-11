/**
 * Cliente de /api/team-access (solo lectura): quién tiene acceso y quién edita horarios.
 * Mismo esquema de auth que services/invoiceRequests.ts.
 */
import { getIdTokenOrThrow } from '../firebase';
import { parseTeamAccessResponse, type TeamAccessResponse } from '../../shared/teamAccess';

const PROXY_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ODOO_PROXY_URL) || '';

export async function fetchTeamAccess(): Promise<TeamAccessResponse> {
  let response: Response;
  try {
    response = await fetch(`${PROXY_BASE}/api/team-access`, {
      headers: { Authorization: `Bearer ${await getIdTokenOrThrow()}` },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new Error('No se pudo conectar con el servidor.');
  }
  return parseTeamAccessResponse(response);
}
