import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { HolidayTheme } from '../services/holidayTheme';
import HolidayScene from './HolidayScene';
import HolidayCameo from './HolidayCameo';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardFooterProps {
  totalOrders: number;
  // Pagination
  pages: unknown[];
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  holiday?: HolidayTheme | null;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardFooter: React.FC<DashboardFooterProps> = ({
  totalOrders,
  pages,
  currentPageIndex,
  onPageChange,
  toast,
  holiday,
}) => {
  return (
    <footer className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background py-2 text-[9px] uppercase tracking-wider text-muted-foreground sticky bottom-0 z-[60] flex-shrink-0 lg:py-3 lg:text-[10px]" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {holiday && <HolidayScene kind={holiday.scene} />}
      {holiday?.id === 'cumple' && <HolidayCameo />}
      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
        <div className="whitespace-nowrap font-mono-data">
          <span className="hidden sm:inline text-muted-foreground">Total:</span>{' '}
          <span className="font-bold text-primary">{totalOrders}</span>{' '}
          <span className="text-muted-foreground">visibles</span>
        </div>

        {pages.length > 1 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden lg:inline whitespace-nowrap font-mono-data text-muted-foreground">
              Pantalla <span className="font-bold text-secondary-foreground">{currentPageIndex + 1}</span> de {pages.length}
            </span>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto no-scrollbar" aria-label={`Pantalla ${currentPageIndex + 1} de ${pages.length}`}>
            {pages.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onPageChange(idx)}
                aria-label={`Página ${idx + 1}`}
                aria-current={idx === currentPageIndex ? 'page' : undefined}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-sm px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <div
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    idx === currentPageIndex
                      ? 'w-7 bg-primary'
                      : 'w-2 bg-foreground/20 hover:bg-foreground/40'
                  }`}
                />
              </button>
            ))}
            </div>
          </div>
        )}
        <AnimatePresence>
          {toast && (
            <motion.div
              role="status"
              aria-live="polite"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-lg font-bold shadow-lg border ${
                toast.type === 'error'
                  ? 'bg-destructive/20 text-destructive border-destructive/30'
                  : toast.type === 'success'
                  ? 'bg-success/20 text-success border-success/30'
                  : 'bg-primary/20 text-primary border-primary/30'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3 font-mono-data max-lg:hidden lg:gap-4">
        {([
          ['bg-cyan-400', 'A tiempo'],
          ['bg-amber-400', 'Atraso 0–7 d'],
          ['bg-orange-500', '8–30 d'],
          ['bg-red-500', 'Más de 30 d'],
          ['bg-zinc-400', 'Sin fecha'],
          ['bg-fuchsia-400', 'Entregada · por facturar'],
        ] as const).map(([color, label]) => (
          <span key={label} className="flex items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-sm ${color}`} />
            <span className="text-muted-foreground">{label}</span>
          </span>
        ))}
      </div>
    </footer>
  );
};

export default DashboardFooter;
