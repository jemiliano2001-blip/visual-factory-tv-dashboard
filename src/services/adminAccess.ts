/** Reglas de acceso compartidas por la ruta y la UI administrativa. */
export function hasAdminClaim(claims: Record<string, unknown> | null | undefined): boolean {
  return claims?.admin === true;
}
