import React from 'react';
import { getCompanyAcronym } from '../utils/customerNames';
import { getCustomerLogo } from '../utils/customerLogos';

export type CompanyBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CompanyBadgeProps {
  /** Nombre del cliente / empresa (ej. "TERMOFORMADOS INDUSTRIALES", "KOHLER REYNOSA") */
  company: string | null | undefined;
  /** Tamaño de la insignia (altura fija; el ancho se adapta al logo) */
  size?: CompanyBadgeSize;
  /** Clases CSS adicionales */
  className?: string;
}

const SIZE_MAP: Record<CompanyBadgeSize, { box: string; text: string; maxWidth: string }> = {
  xs: { box: 'h-[22px] rounded-md px-1', text: 'text-[9px]', maxWidth: 'max-w-[88px]' },
  sm: { box: 'h-7 rounded-lg px-1.5', text: 'text-[10px]', maxWidth: 'max-w-[112px]' },
  md: { box: 'h-9 rounded-xl px-2', text: 'text-xs', maxWidth: 'max-w-[144px]' },
  lg: { box: 'h-12 rounded-xl px-2.5', text: 'text-sm', maxWidth: 'max-w-[190px]' },
  xl: { box: 'h-14 rounded-2xl px-3', text: 'text-base', maxWidth: 'max-w-[224px]' },
};

// Los logos oficiales se muestran tal como son, sobre un fondo donde se leen:
// oscuro para los de texto blanco, claro para los de texto de color.
const TILE_CLASS = {
  dark: 'border-border bg-card',
  light: 'border-zinc-300/70 bg-zinc-100',
} as const;

export const CompanyBadge: React.FC<CompanyBadgeProps> = ({ company, size = 'md', className = '' }) => {
  const companyName = company?.trim() || '';
  const config = SIZE_MAP[size];
  const logo = getCustomerLogo(companyName);

  if (logo) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center border py-1 ${TILE_CLASS[logo.tile]} ${config.box} ${config.maxWidth} ${className}`}
        title={companyName}
      >
        <img
          src={logo.src}
          alt={`Logo de ${companyName}`}
          decoding="async"
          draggable={false}
          className="h-full w-auto max-w-full object-contain"
        />
      </div>
    );
  }

  // Sin logo oficial: monograma neutro. No se inventa un logo.
  return (
    <div
      className={`flex aspect-square shrink-0 items-center justify-center border border-border bg-secondary ${config.box} ${className}`}
      title={companyName}
      aria-label={`Insignia de ${companyName}`}
    >
      <span className={`font-mono-data font-bold tracking-tight text-foreground ${config.text}`}>
        {getCompanyAcronym(companyName)}
      </span>
    </div>
  );
};

export default CompanyBadge;
