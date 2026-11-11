/**
 * Un fallo al cargar órdenes no siempre es de Odoo: también llegan por el mismo
 * camino el acceso del Hub (403/503), el token vencido (401) y la sesión ausente.
 * Esos mensajes ya se explican solos y no deben presentarse como "Odoo caído".
 */
export function isAccessError(message: string): boolean {
  return /acceso|sesión|token/i.test(message);
}

/** Texto de la banda de error de Admin y Estadísticas. */
export function loadErrorLabel(message: string): string {
  return isAccessError(message) ? message : `SIN CONEXIÓN A ODOO — ${message}`;
}
