/**
 * src/utils/customerLogos.ts
 *
 * Catálogo de logos OFICIALES de clientes (bajados de los sitios de cada
 * empresa; ver public/logos). El matching es parcial y sin distinguir
 * mayúsculas para tolerar variantes del partner_name de Odoo
 * (ej. "AFX INDUSTRIES S.A. DE C.V." → /logos/afx.png).
 *
 * Un cliente sin entrada aquí NO recibe un logo inventado: CompanyBadge
 * muestra su monograma. Siltech es parte de Sensata y TIM no tiene sitio ni
 * logo público, por eso no aparecen.
 */

export interface CustomerLogo {
  /** Ruta del archivo en /public */
  src: string;
  /** Fondo de la insignia sobre el que el logo se ve bien: los logos con
   *  texto blanco (Suprajit, Sensata, Kohler) piden fondo oscuro. */
  tile: 'dark' | 'light';
}

interface CustomerLogoEntry extends CustomerLogo {
  /** Expresiones (sin distinguir mayúsculas) que deben aparecer en el partner_name */
  keywords: string[];
}

const CUSTOMER_LOGO_MAP: CustomerLogoEntry[] = [
  { keywords: ['afx'],                     src: '/logos/afx.png',       tile: 'light' },
  { keywords: ['fisher'],                  src: '/logos/fisher.png',    tile: 'light' },
  { keywords: ['kohler'],                  src: '/logos/kohler.svg',    tile: 'dark' },
  { keywords: ['sensata'],                 src: '/logos/sensata.png',   tile: 'dark' },
  { keywords: ['suprajit'],                src: '/logos/suprajit.png',  tile: 'dark' },
  // OHD = Overhead Door Corporation
  { keywords: ['\\bohd\\b', 'overhead door'], src: '/logos/ohd.png',      tile: 'light' },
];

/**
 * Retorna el logo oficial dado el `partner_name` de Odoo, o `null` si no hay.
 */
export function getCustomerLogo(partnerName: string): CustomerLogo | null {
  if (!partnerName) return null;

  for (const { keywords, src, tile } of CUSTOMER_LOGO_MAP) {
    if (keywords.some(kw => new RegExp(kw, 'i').test(partnerName))) return { src, tile };
  }
  return null;
}
