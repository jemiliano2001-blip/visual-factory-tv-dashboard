/**
 * Utilidades compartidas entre `server.ts` y `functions/src/index.ts` para
 * validación de actor autenticado y resumen seguro de errores en logs.
 */
import type { RequestActor } from './invoiceRequests';

export const NO_ACTOR = 'Se requiere una cuenta de personal SMV.';

export function isActor(value: unknown): value is RequestActor {
  return typeof value === 'object' && value !== null && typeof (value as RequestActor).uid === 'string';
}

export function safeErrorSummary(err: unknown): { name: string; message: string } {
  if (err instanceof Error) {
    return {
      name: err.name || 'Error',
      message: err.message.replace(/\s+/g, ' ').trim().slice(0, 200),
    };
  }
  return { name: 'UnknownError', message: String(err).replace(/\s+/g, ' ').trim().slice(0, 200) };
}
