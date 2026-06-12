/**
 * src/utils/customerLogos.ts
 *
 * Mapa de nombres de clientes → rutas de logos.
 * El matching es parcial y case-insensitive para tolerar variantes del
 * nombre que Odoo pueda enviar (ej. "AFX INDUSTRIES S.A. DE C.V." → /logos/afx.png).
 */

interface CustomerLogoEntry {
  /** Palabras clave que deben aparecer en el partner_name para hacer match */
  keywords: string[];
  /** Ruta del logo en /public */
  logoPath: string;
}

const CUSTOMER_LOGO_MAP: CustomerLogoEntry[] = [
  { keywords: ['afx'],         logoPath: '/logos/afx.png' },
  { keywords: ['magna'],       logoPath: '/logos/magna.png' },
  { keywords: ['fisher'],      logoPath: '/logos/fisher.png' },
  { keywords: ['kohler'],      logoPath: '/logos/kohler.png' },
  { keywords: ['mecalux'],     logoPath: '/logos/mecalux.png' },
  { keywords: ['genie'],       logoPath: '/logos/genie.png' },
  { keywords: ['sensata'],     logoPath: '/logos/sensata.png' },
  { keywords: ['siltech'],     logoPath: '/logos/siltech.png' },
  { keywords: ['suprajit'],    logoPath: '/logos/suprajit.png' },
  { keywords: ['cypress'],     logoPath: '/logos/cypress.png' },
  { keywords: ['robertshaw'],  logoPath: '/logos/robertshaw.png' },
  { keywords: ['termoformados', 'tim matamoros', '\\btim\\b'],
                               logoPath: '/logos/tim.png' },
  { keywords: ['smv'],         logoPath: '/logos/smv.png' },
];

/**
 * Retorna la URL del logo dado el `partner_name` de Odoo.
 * Hace matching parcial case-insensitive para tolerancia a variantes.
 * @returns URL del logo o `null` si no hay match.
 */
export function getCustomerLogo(partnerName: string): string | null {
  if (!partnerName) return null;
  const lower = partnerName.toLowerCase();

  for (const entry of CUSTOMER_LOGO_MAP) {
    const matches = entry.keywords.some(kw => {
      try {
        return new RegExp(kw, 'i').test(lower);
      } catch {
        return lower.includes(kw.toLowerCase());
      }
    });
    if (matches) return entry.logoPath;
  }

  return null;
}
