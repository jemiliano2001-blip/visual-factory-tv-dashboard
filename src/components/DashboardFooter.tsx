import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardFooterProps {
  totalOrders: number;
  // Pagination
  pages: unknown[];
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardFooter: React.FC<DashboardFooterProps> = ({
  totalOrders,
  pages,
  currentPageIndex,
  onPageChange,
  toast,
}) => {
  return (
    <footer className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background py-2 text-[9px] uppercase tracking-wider text-muted-foreground/70 sticky bottom-0 z-[60] flex-shrink-0 lg:py-3 lg:text-[10px]" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
        <div className="whitespace-nowrap font-mono-data">
          <span className="hidden sm:inline text-muted-foreground/70">Total:</span>{' '}
          <span className="font-bold text-indigo-300">{totalOrders}</span>{' '}
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
                      ? 'w-7 bg-indigo-400'
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
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`px-3 py-1.5 rounded-lg font-bold shadow-lg border ${
                toast.type === 'error'
                  ? 'bg-red-500/20 text-red-300 border-red-500/30'
                  : toast.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex min-w-0 items-center justify-end gap-3 font-mono-data max-lg:hidden lg:gap-4">
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
          <span className="text-muted-foreground">Pendiente</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
          <span className="text-muted-foreground">En proceso</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-fuchsia-400" />
          <span className="text-muted-foreground">Entregado</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          <span className="text-muted-foreground">Vencida</span>
        </span>
      </div>
    </footer>
  );
};

export default DashboardFooter;
