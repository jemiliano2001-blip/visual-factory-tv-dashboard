import React from 'react';
import { getCompanyAcronym } from '../utils/customerNames';
import { getCustomerLogo } from '../utils/customerLogos';

export type CompanyBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface CompanyBadgeProps {
  /** Nombre del cliente / empresa (ej. "TERMOFORMADOS INDUSTRIALES", "KOHLER REYNOSA") */
  company: string | null | undefined;
  /** Tamaño de la insignia */
  size?: CompanyBadgeSize;
  /** Clases CSS adicionales */
  className?: string;
}

const SIZE_MAP: Record<CompanyBadgeSize, { box: string; padding: string; text: string }> = {
  xs: { box: 'h-[22px] w-[22px] rounded-md', padding: 'p-0.5', text: 'text-[9px]' },
  sm: { box: 'h-7 w-7 rounded-lg', padding: 'p-1', text: 'text-[10px]' },
  md: { box: 'h-9 w-9 rounded-xl', padding: 'p-1', text: 'text-xs' },
  lg: { box: 'h-12 w-12 rounded-xl', padding: 'p-1.5', text: 'text-sm' },
  xl: { box: 'h-14 w-14 rounded-2xl', padding: 'p-1.5', text: 'text-base' },
};

/**
 * Insignia cuadrada del cliente. Todas las marcas comparten el mismo fondo y
 * estilo plano; un cliente sin marca recibe un monograma neutro.
 */
export const CompanyBadge: React.FC<CompanyBadgeProps> = ({ company, size = 'md', className = '' }) => {
  const companyName = company?.trim() || '';
  const config = SIZE_MAP[size];
  const logo = getCustomerLogo(companyName);

  return (
    <div
      className={`flex shrink-0 items-center justify-center border border-border bg-card ${config.box} ${className}`}
      title={companyName}
    >
      {logo ? (
        <img
          src={logo}
          alt={`Marca de ${companyName}`}
          decoding="async"
          draggable={false}
          className={`h-full w-full object-contain ${config.padding}`}
        />
      ) : (
        <span
          aria-label={`Insignia de ${companyName}`}
          className={`font-mono-data font-bold tracking-tight text-foreground ${config.text}`}
        >
          {getCompanyAcronym(companyName)}
        </span>
      )}
    </div>
  );
};

export default CompanyBadge;
