/**
 * src/utils/customerLogos.ts
 *
 * Marcas de clientes: ilustraciones vectoriales propias (public/logos/*.svg) con
 * un mismo estilo plano para todas, inspiradas en la identidad de cada empresa
 * (no son sus logos oficiales). El matching es parcial y sin distinguir
 * mayúsculas para tolerar variantes del partner_name de Odoo
 * (ej. "AFX INDUSTRIES S.A. DE C.V." → /logos/afx.svg).
 *
 * Un cliente sin entrada aquí recibe un monograma neutro en CompanyBadge.
 */

interface CustomerLogoEntry {
  /** Expresiones (sin distinguir mayúsculas) que deben aparecer en el partner_name */
  keywords: string[];
  /** Ruta del archivo en /public */
  src: string;
}

const CUSTOMER_LOGO_MAP: CustomerLogoEntry[] = [
  { keywords: ['afx'],                          src: '/logos/afx.svg' },
  { keywords: ['fisher'],                       src: '/logos/fisher.svg' },
  { keywords: ['kohler'],                       src: '/logos/kohler.svg' },
  { keywords: ['sensata'],                      src: '/logos/sensata.svg' },
  { keywords: ['suprajit'],                     src: '/logos/suprajit.svg' },
  // OHD = Overhead Door Corporation
  { keywords: ['\\bohd\\b', 'overhead door'],   src: '/logos/ohd.svg' },
  // Silicone Technologies (Siltech) es una planta de Sensata, pero es un cliente aparte
  { keywords: ['siltech', 'silicone tech'],     src: '/logos/siltech.svg' },
  { keywords: ['termoformados', '\\btim\\b'],   src: '/logos/tim.svg' },
];

/**
 * Retorna la ruta de la marca dado el `partner_name` de Odoo, o `null` si no hay.
 */
export function getCustomerLogo(partnerName: string): string | null {
  if (!partnerName) return null;
  const entry = CUSTOMER_LOGO_MAP.find(({ keywords }) =>
    keywords.some(kw => new RegExp(kw, 'i').test(partnerName)),
  );
  return entry?.src ?? null;
}
