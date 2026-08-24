import React from 'react';
import { getCompanyAcronym } from '../utils/customerNames';

export type CompanyBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CompanyBadgeProps {
  /** Nombre del cliente / empresa (ej. "TERMOFORMADOS INDUSTRIALES", "KOHLER REYNOSA") */
  company: string | null | undefined;
  /** Tamaño de la insignia */
  size?: CompanyBadgeSize;
  /** Clases CSS adicionales */
  className?: string;
  /** Si debe proyectar resplandor neón sutil */
  showGlow?: boolean;
}

interface BrandDefinition {
  keywords: (string | RegExp)[];
  glowColor: string;
  borderColor: string;
  renderIcon: (sizePx: number) => React.ReactNode;
}

const SIZE_MAP: Record<CompanyBadgeSize, { sizePx: number; containerClass: string; textClass: string; roundedClass: string }> = {
  xs: { sizePx: 22, containerClass: 'w-[22px] h-[22px]', textClass: 'text-[9px]', roundedClass: 'rounded-md' },
  sm: { sizePx: 28, containerClass: 'w-7 h-7', textClass: 'text-[10px]', roundedClass: 'rounded-lg' },
  md: { sizePx: 36, containerClass: 'w-9 h-9', textClass: 'text-xs', roundedClass: 'rounded-xl' },
  lg: { sizePx: 48, containerClass: 'w-12 h-12', textClass: 'text-sm', roundedClass: 'rounded-xl' },
  xl: { sizePx: 56, containerClass: 'w-14 h-14', textClass: 'text-base', roundedClass: 'rounded-2xl' },
};

/**
 * Catálogo de marcas con vectores SVG vibrantes y geometría limpia
 */
const BRAND_DEFINITIONS: BrandDefinition[] = [
  // ─── 1. TIM MATAMOROS / TERMOFORMADOS ─────────────────────────────────────────
  {
    keywords: ['termoformados', 'tim matamoros', /\btim\b/i],
    glowColor: 'rgba(245, 158, 11, 0.35)',
    borderColor: 'rgba(245, 158, 11, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="timGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FBBF24" />
            <stop offset="100%" stop-color="#F59E0B" />
          </linearGradient>
          <linearGradient id="timCyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38BDF8" />
            <stop offset="100%" stop-color="#0284C7" />
          </linearGradient>
        </defs>
        {/* Capas escalonadas de termoformado al vacío */}
        <rect x="6" y="8" width="28" height="6" rx="2" fill="url(#timGrad)" />
        <rect x="10" y="17" width="20" height="6" rx="2" fill="url(#timCyan)" />
        <rect x="14" y="26" width="12" height="6" rx="2" fill="url(#timGrad)" />
      </svg>
    ),
  },

  // ─── 2. KOHLER ────────────────────────────────────────────────────────────────
  {
    keywords: ['kohler'],
    glowColor: 'rgba(225, 29, 72, 0.35)',
    borderColor: 'rgba(225, 29, 72, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="kohlerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FB7185" />
            <stop offset="100%" stop-color="#E11D48" />
          </linearGradient>
        </defs>
        {/* Monograma 'K' geométrico industrial de Kohler */}
        <path d="M10 8 H15 V32 H10 Z" fill="url(#kohlerGrad)" />
        <path d="M16 20 L27 8 H33 L21 21 L33 32 H27 L16 22 Z" fill="url(#kohlerGrad)" />
      </svg>
    ),
  },

  // ─── 3. SUPRAJIT ──────────────────────────────────────────────────────────────
  {
    keywords: ['suprajit'],
    glowColor: 'rgba(59, 130, 246, 0.35)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="suprajitRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F87171" />
            <stop offset="100%" stop-color="#EF4444" />
          </linearGradient>
          <linearGradient id="suprajitBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#60A5FA" />
            <stop offset="100%" stop-color="#2563EB" />
          </linearGradient>
        </defs>
        {/* Alas gemelas dinámicas automotrices / 'S' de Suprajit */}
        <path d="M8 12 C16 6, 28 8, 32 14 C26 14, 18 16, 12 20 Z" fill="url(#suprajitRed)" />
        <path d="M32 28 C24 34, 12 32, 8 26 C14 26, 22 24, 28 20 Z" fill="url(#suprajitBlue)" />
      </svg>
    ),
  },

  // ─── 4. MECALUX ───────────────────────────────────────────────────────────────
  {
    keywords: ['mecalux'],
    glowColor: 'rgba(249, 115, 22, 0.35)',
    borderColor: 'rgba(249, 115, 22, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="mecaluxOrange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#FB923C" />
            <stop offset="100%" stop-color="#EA580C" />
          </linearGradient>
        </defs>
        {/* Chevron estructural / 'M' de almacenamiento de Mecalux */}
        <path d="M8 30 V10 L20 22 L32 10 V30 H27 V18 L20 25 L13 18 V30 Z" fill="url(#mecaluxOrange)" />
      </svg>
    ),
  },

  // ─── 5. MAGNA ─────────────────────────────────────────────────────────────────
  {
    keywords: ['magna'],
    glowColor: 'rgba(220, 38, 38, 0.35)',
    borderColor: 'rgba(220, 38, 38, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="magnaRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#EF4444" />
            <stop offset="100%" stop-color="#B91C1C" />
          </linearGradient>
        </defs>
        {/* Polígono 'M' dinámico de Magna */}
        <path d="M8 30 L14 10 L20 23 L26 10 L32 30 H26 L22 17 L20 22 L18 17 L14 30 Z" fill="url(#magnaRed)" />
      </svg>
    ),
  },

  // ─── 6. FISHER DYNAMICS ───────────────────────────────────────────────────────
  {
    keywords: ['fisher'],
    glowColor: 'rgba(6, 182, 212, 0.35)',
    borderColor: 'rgba(6, 182, 212, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="fisherGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#22D3EE" />
            <stop offset="100%" stop-color="#0284C7" />
          </linearGradient>
        </defs>
        {/* 'F' aerodinámica y onda cinética de Fisher */}
        <path d="M10 9 H30 C30 9 28 14 20 14 H16 V19 H26 C26 19 24 24 18 24 H16 V31 H10 Z" fill="url(#fisherGrad)" />
      </svg>
    ),
  },

  // ─── 7. SENSATA TECHNOLOGIES ──────────────────────────────────────────────────
  {
    keywords: ['sensata'],
    glowColor: 'rgba(225, 29, 72, 0.35)',
    borderColor: 'rgba(225, 29, 72, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="sensataGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F43F5E" />
            <stop offset="100%" stop-color="#BE123C" />
          </linearGradient>
        </defs>
        {/* Pulso sensor concéntrico de Sensata */}
        <circle cx="20" cy="20" r="12" stroke="url(#sensataGrad)" stroke-width="3" stroke-dasharray="8 4" />
        <circle cx="20" cy="20" r="5" fill="url(#sensataGrad)" />
      </svg>
    ),
  },

  // ─── 8. SILTECH ───────────────────────────────────────────────────────────────
  {
    keywords: ['siltech'],
    glowColor: 'rgba(16, 185, 129, 0.35)',
    borderColor: 'rgba(16, 185, 129, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="siltechGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#34D399" />
            <stop offset="100%" stop-color="#059669" />
          </linearGradient>
        </defs>
        {/* Circuito prismático / 'S' tecnológica de Siltech */}
        <path d="M12 12 H28 V18 H18 V22 H28 V28 H12 V22 H22 V18 H12 Z" fill="url(#siltechGrad)" />
      </svg>
    ),
  },

  // ─── 9. AFX INDUSTRIES ────────────────────────────────────────────────────────
  {
    keywords: ['afx'],
    glowColor: 'rgba(139, 92, 246, 0.35)',
    borderColor: 'rgba(139, 92, 246, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="afxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#A78BFA" />
            <stop offset="100%" stop-color="#7C3AED" />
          </linearGradient>
        </defs>
        {/* Triángulo delta aeroespacial estilizado */}
        <path d="M20 7 L33 31 H26 L20 18 L14 31 H7 Z" fill="url(#afxGrad)" />
      </svg>
    ),
  },

  // ─── 10. CYPRESS / INFINEON ───────────────────────────────────────────────────
  {
    keywords: ['cypress', 'infineon'],
    glowColor: 'rgba(132, 204, 22, 0.35)',
    borderColor: 'rgba(132, 204, 22, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cypressGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#A3E635" />
            <stop offset="100%" stop-color="#65A30D" />
          </linearGradient>
        </defs>
        {/* Nodo semiconductor / matriz de circuitos */}
        <circle cx="14" cy="14" r="4" fill="url(#cypressGrad)" />
        <circle cx="26" cy="14" r="4" fill="url(#cypressGrad)" />
        <circle cx="20" cy="26" r="5" fill="url(#cypressGrad)" />
        <path d="M14 14 L20 26 L26 14" stroke="url(#cypressGrad)" stroke-width="2.5" />
      </svg>
    ),
  },

  // ─── 11. ROBERTSHAW ───────────────────────────────────────────────────────────
  {
    keywords: ['robertshaw'],
    glowColor: 'rgba(245, 158, 11, 0.35)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="robertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#F59E0B" />
            <stop offset="100%" stop-color="#DC2626" />
          </linearGradient>
        </defs>
        {/* Llama de control térmico & 'R' */}
        <path d="M20 7 C20 7 28 15 28 23 C28 28 24 32 20 32 C16 32 12 28 12 23 C12 17 18 12 20 7 Z" fill="url(#robertGrad)" />
        <circle cx="20" cy="24" r="3" fill="#09090b" />
      </svg>
    ),
  },

  // ─── 12. GENIE / TEREX ────────────────────────────────────────────────────────
  {
    keywords: ['genie', 'terex'],
    glowColor: 'rgba(2, 132, 199, 0.35)',
    borderColor: 'rgba(56, 189, 248, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="genieGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#38BDF8" />
            <stop offset="100%" stop-color="#0284C7" />
          </linearGradient>
        </defs>
        {/* Elevador industrial geométrico 'G' */}
        <path d="M28 13 C26 10 23 8 19 8 C13 8 9 13 9 20 C9 27 13 32 19 32 C25 32 29 28 29 23 H19 V19 H33 V30 C30 33 25 35 19 35 C10 35 5 28 5 20 C5 12 10 5 19 5 C25 5 30 8 33 13 Z" fill="url(#genieGrad)" />
      </svg>
    ),
  },

  // ─── 13. OHD OPERATORS ────────────────────────────────────────────────────────
  {
    keywords: ['ohd', 'overhead'],
    glowColor: 'rgba(99, 102, 241, 0.35)',
    borderColor: 'rgba(99, 102, 241, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="ohdGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#818CF8" />
            <stop offset="100%" stop-color="#4F46E5" />
          </linearGradient>
        </defs>
        {/* Puerta seccional overhead / 'OHD' */}
        <rect x="8" y="9" width="24" height="4" rx="1" fill="url(#ohdGrad)" />
        <rect x="8" y="15" width="24" height="4" rx="1" fill="url(#ohdGrad)" />
        <rect x="8" y="21" width="24" height="4" rx="1" fill="url(#ohdGrad)" />
        <rect x="8" y="27" width="24" height="4" rx="1" fill="url(#ohdGrad)" />
      </svg>
    ),
  },

  // ─── 14. SMV ──────────────────────────────────────────────────────────────────
  {
    keywords: ['smv', 'soluciones metrologicas'],
    glowColor: 'rgba(99, 102, 241, 0.4)',
    borderColor: 'rgba(34, 211, 238, 0.45)',
    renderIcon: () => (
      <svg viewBox="0 0 40 40" fill="none" className="w-full h-full p-1.5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="smvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#818CF8" />
            <stop offset="50%" stop-color="#6366F1" />
            <stop offset="100%" stop-color="#22D3EE" />
          </linearGradient>
        </defs>
        {/* Retícula de precisión y metrología */}
        <circle cx="20" cy="20" r="11" stroke="url(#smvGrad)" stroke-width="2.5" />
        <line x1="20" y1="5" x2="20" y2="35" stroke="url(#smvGrad)" stroke-width="2" />
        <line x1="5" y1="20" x2="35" y2="20" stroke="url(#smvGrad)" stroke-width="2" />
      </svg>
    ),
  },
];

/**
 * Paletas armónicas para generación de monogramas fallback
 */
const FALLBACK_PALETTES = [
  { text: 'text-cyan-400', border: 'rgba(34, 211, 238, 0.35)', glow: 'rgba(34, 211, 238, 0.25)', bgGrad: 'from-cyan-950/60 to-zinc-950/80' },
  { text: 'text-indigo-400', border: 'rgba(129, 140, 248, 0.35)', glow: 'rgba(129, 140, 248, 0.25)', bgGrad: 'from-indigo-950/60 to-zinc-950/80' },
  { text: 'text-emerald-400', border: 'rgba(52, 211, 153, 0.35)', glow: 'rgba(52, 211, 153, 0.25)', bgGrad: 'from-emerald-950/60 to-zinc-950/80' },
  { text: 'text-amber-400', border: 'rgba(251, 191, 36, 0.35)', glow: 'rgba(251, 191, 36, 0.25)', bgGrad: 'from-amber-950/60 to-zinc-950/80' },
  { text: 'text-fuchsia-400', border: 'rgba(232, 121, 249, 0.35)', glow: 'rgba(232, 121, 249, 0.25)', bgGrad: 'from-fuchsia-950/60 to-zinc-950/80' },
  { text: 'text-rose-400', border: 'rgba(251, 113, 133, 0.35)', glow: 'rgba(251, 113, 133, 0.25)', bgGrad: 'from-rose-950/60 to-zinc-950/80' },
  { text: 'text-sky-400', border: 'rgba(56, 189, 248, 0.35)', glow: 'rgba(56, 189, 248, 0.25)', bgGrad: 'from-sky-950/60 to-zinc-950/80' },
  { text: 'text-violet-400', border: 'rgba(167, 139, 250, 0.35)', glow: 'rgba(167, 139, 250, 0.25)', bgGrad: 'from-violet-950/60 to-zinc-950/80' },
];

function getFallbackPalette(companyName: string) {
  let hash = 0;
  for (let i = 0; i < companyName.length; i++) {
    hash = (hash << 5) - hash + companyName.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % FALLBACK_PALETTES.length;
  return FALLBACK_PALETTES[index];
}

export const CompanyBadge: React.FC<CompanyBadgeProps> = ({
  company,
  size = 'md',
  className = '',
  showGlow = true,
}) => {
  const companyName = company?.trim() || '';
  const lower = companyName.toLowerCase();
  const config = SIZE_MAP[size];

  // Buscar coincidencia en marcas reconocidas
  const matchedBrand = BRAND_DEFINITIONS.find((b) =>
    b.keywords.some((kw) => {
      if (kw instanceof RegExp) return kw.test(lower);
      return lower.includes(kw.toLowerCase());
    }),
  );

  if (matchedBrand) {
    const shadowStyle = showGlow
      ? {
          boxShadow: `0 0 16px ${matchedBrand.glowColor}, inset 0 0 12px rgba(255,255,255,0.03)`,
          borderColor: matchedBrand.borderColor,
        }
      : { borderColor: matchedBrand.borderColor };

    return (
      <div
        className={`flex shrink-0 items-center justify-center bg-[#0d0d14]/95 backdrop-blur-md border ${config.containerClass} ${config.roundedClass} ${className} transition-transform duration-200`}
        style={shadowStyle}
        title={companyName}
        aria-label={`Logo de ${companyName}`}
      >
        {matchedBrand.renderIcon(config.sizePx)}
      </div>
    );
  }

  // Fallback con monograma determinista y colores armónicos
  const acronym = getCompanyAcronym(companyName);
  const palette = getFallbackPalette(companyName);
  const shadowStyle = showGlow
    ? {
        boxShadow: `0 0 14px ${palette.glow}, inset 0 0 10px rgba(255,255,255,0.03)`,
        borderColor: palette.border,
      }
    : { borderColor: palette.border };

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${palette.bgGrad} border ${config.containerClass} ${config.roundedClass} ${className} transition-transform duration-200`}
      style={shadowStyle}
      title={companyName}
      aria-label={`Insignia de ${companyName}`}
    >
      <span className={`font-mono-data font-black tracking-tight ${palette.text} ${config.textClass}`}>
        {acronym}
      </span>
    </div>
  );
};

export default CompanyBadge;
