/**
 * src/utils/customerNames.ts
 *
 * Utilidades inteligentes para formatear, limpiar y acortar nombres
 * de clientes comerciales y razones sociales de Odoo para su óptima
 * visualización en pantallas de TV, tarjetas y encabezados sin truncamientos.
 */

export type SmartNameMode = 'header' | 'card' | 'compact';

interface BrandAlias {
  keywords: (string | RegExp)[];
  names: {
    header: string;
    card: string;
    compact: string;
  };
}

/**
 * Diccionario de clientes reconocidos para visualización industrial directa
 */
const KNOWN_BRAND_ALIASES: BrandAlias[] = [
  {
    keywords: ['termoformados', 'tim matamoros', /\btim\b/i],
    names: {
      header: 'TIM MATAMOROS',
      card: 'TIM MATAMOROS',
      compact: 'TIM',
    },
  },
  {
    keywords: ['suprajit'],
    names: {
      header: 'SUPRAJIT MEXICO',
      card: 'SUPRAJIT',
      compact: 'SUPRAJIT',
    },
  },
  {
    keywords: ['kohler'],
    names: {
      header: 'KOHLER REYNOSA',
      card: 'KOHLER',
      compact: 'KOHLER',
    },
  },
  {
    keywords: ['fisher'],
    names: {
      header: 'FISHER DYNAMICS',
      card: 'FISHER DYNAMICS',
      compact: 'FISHER',
    },
  },
  {
    keywords: ['mecalux'],
    names: {
      header: 'MECALUX',
      card: 'MECALUX',
      compact: 'MECALUX',
    },
  },
  {
    keywords: ['magna'],
    names: {
      header: 'MAGNA',
      card: 'MAGNA',
      compact: 'MAGNA',
    },
  },
  {
    keywords: ['sensata'],
    names: {
      header: 'SENSATA',
      card: 'SENSATA',
      compact: 'SENSATA',
    },
  },
  {
    keywords: ['siltech'],
    names: {
      header: 'SILTECH',
      card: 'SILTECH',
      compact: 'SILTECH',
    },
  },
  {
    keywords: ['afx'],
    names: {
      header: 'AFX INDUSTRIES',
      card: 'AFX INDUSTRIES',
      compact: 'AFX',
    },
  },
  {
    keywords: ['cypress', 'infineon'],
    names: {
      header: 'CYPRESS',
      card: 'CYPRESS',
      compact: 'CYPRESS',
    },
  },
  {
    keywords: ['robertshaw'],
    names: {
      header: 'ROBERTSHAW',
      card: 'ROBERTSHAW',
      compact: 'ROBERTSHAW',
    },
  },
  {
    keywords: ['genie', 'terex'],
    names: {
      header: 'GENIE',
      card: 'GENIE',
      compact: 'GENIE',
    },
  },
  {
    keywords: ['ohd', 'overhead'],
    names: {
      header: 'OHD OPERATORS',
      card: 'OHD OPERATORS',
      compact: 'OHD',
    },
  },
  {
    keywords: ['smv', 'soluciones metrologicas'],
    names: {
      header: 'SMV METROLOGÍA',
      card: 'SMV',
      compact: 'SMV',
    },
  },
];

/** Patrones de razones sociales y sufijos legales comunes */
const LEGAL_SUFFIXES = [
  /\bS\.?\s*A\.?\s*DE\s*C\.?\s*V\.?\b/gi,
  /\bS\.?\s*DE\s*R\.?\s*L\.?\s*DE\s*C\.?\s*V\.?\b/gi,
  /\bS\.?\s*DE\s*R\.?\s*L\.?\b/gi,
  /\bS\.?\s*A\.?\s*P\.?\s*I\.?\s*DE\s*C\.?\s*V\.?\b/gi,
  /\bS\.?\s*A\.?\s*P\.?\s*I\.?\b/gi,
  /\bS\.?\s*A\.?\b/gi,
  /\bS\.?\s*C\.?\b/gi,
  /\bS\.?\s*EN\s*C\.?\b/gi,
  /\bDE\s+C\.?\s*V\.?\b/gi,
  /\bS\.?\s*DE\s*R\.?\s*L\.?\b/gi,
  /\bDE\s+M[EÉ]XICO\b/gi,
  /\bINC\.?\b/gi,
  /\bLLC\.?\b/gi,
  /\bLTD\.?\b/gi,
  /\bCORP\.?\b/gi,
  /\bGMBH\b/gi,
];

/**
 * Limpia sufijos corporativos y caracteres residuales
 */
export function stripLegalSuffixes(name: string): string {
  if (!name) return '';
  let cleaned = name.trim();

  for (const suffix of LEGAL_SUFFIXES) {
    cleaned = cleaned.replace(suffix, ' ');
  }

  // Eliminar comas, puntos o guiones al final y espacios múltiples
  return cleaned
    .replace(/[,\.\-_/]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Obtiene el nombre comercial inteligente y optimizado para el espacio disponible.
 *
 * @param rawName Nombre del contacto / cliente en Odoo
 * @param mode 'header' para títulos de TV, 'card' para tarjetas, 'compact' para chips
 */
export function getSmartCompanyName(
  rawName: string | null | undefined,
  mode: SmartNameMode = 'card',
): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();

  // 1. Buscar en el diccionario de marcas conocidas
  for (const alias of KNOWN_BRAND_ALIASES) {
    const isMatch = alias.keywords.some((kw) => {
      if (kw instanceof RegExp) return kw.test(lower);
      return lower.includes(kw.toLowerCase());
    });

    if (isMatch) {
      return alias.names[mode];
    }
  }

  // 2. Limpieza general de razones sociales
  const cleaned = stripLegalSuffixes(trimmed);

  if (mode === 'compact') {
    return getCompanyAcronym(cleaned);
  }

  if (mode === 'card') {
    // Si sigue siendo muy largo en la tarjeta (>22 chars), acortar a las primeras palabras clave
    if (cleaned.length > 22) {
      const words = cleaned.split(/\s+/);
      if (words.length > 2) {
        return words.slice(0, 2).join(' ');
      }
    }
    return cleaned;
  }

  // mode === 'header'
  if (cleaned.length > 34) {
    const words = cleaned.split(/\s+/);
    if (words.length > 3) {
      return words.slice(0, 3).join(' ');
    }
  }

  return cleaned;
}

/**
 * Genera un acrónimo o monograma de 1 a 3 letras para el cliente
 */
export function getCompanyAcronym(name: string | null | undefined): string {
  if (!name) return 'VF';
  const cleaned = stripLegalSuffixes(name);
  if (!cleaned) return 'VF';

  const words = cleaned.split(/\s+/).filter((w) => w.length > 1);

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  if (words.length === 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  return (words[0][0] + words[1][0] + (words[2]?.[0] || '')).slice(0, 3).toUpperCase();
}
