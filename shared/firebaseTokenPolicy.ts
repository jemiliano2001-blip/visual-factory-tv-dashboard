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
