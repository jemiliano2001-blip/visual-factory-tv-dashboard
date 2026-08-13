import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2 } from 'lucide-react';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardFooterProps {
  totalOrders: number;
  // Pagination
  pages: unknown[];
  currentPageIndex: number;
  onPageChange: (index: number) => void;
  // Toast
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  // Voice
  isRecording: boolean;
  isProcessingVoice: boolean;
  isSpeaking: boolean;
  onToggleRecording: () => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardFooter: React.FC<DashboardFooterProps> = ({
  totalOrders,
  pages,
  currentPageIndex,
  onPageChange,
  toast,
  isRecording,
  isProcessingVoice,
  isSpeaking,
  onToggleRecording,
}) => {
  return (
    <footer className="mt-auto grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 bg-background py-2 text-[9px] uppercase tracking-widest text-zinc-600 sticky bottom-0 z-[60] flex-shrink-0 lg:py-3 lg:text-[10px]" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex min-w-0 items-center gap-3 lg:gap-4">
        <div className="whitespace-nowrap font-mono-data">
          <span className="hidden sm:inline text-zinc-600">Total:</span>{' '}
          <span className="font-bold text-indigo-300">{totalOrders}</span>{' '}
          <span className="text-zinc-500">visibles</span>
        </div>

        {pages.length > 1 && (
          <div className="flex min-w-0 items-center gap-2">
            <span className="hidden lg:inline whitespace-nowrap font-mono-data text-zinc-500">
              Pantalla <span className="font-bold text-zinc-300">{currentPageIndex + 1}</span> de {pages.length}
            </span>
            <div className="flex items-center gap-1.5" aria-label={`Pantalla ${currentPageIndex + 1} de ${pages.length}`}>
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
                      ? 'w-7 bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]'
                      : 'w-2 bg-zinc-700 hover:bg-zinc-500'
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
                  ? 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.2)]'
                  : toast.type === 'success'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.2)]'
              }`}
            >
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <button
        type="button"
        onClick={() => {
          if (!isRecording && 'vibrate' in navigator) navigator.vibrate(10);
          onToggleRecording();
        }}
        disabled={isProcessingVoice}
        title={isRecording ? 'Detener grabación' : isSpeaking ? 'Interrumpir y hablar de nuevo' : 'Comando de Voz'}
        aria-label={isRecording ? 'Detener grabación' : isSpeaking ? 'Interrumpir y hablar de nuevo' : 'Comando de voz'}
        className={`w-11 h-11 lg:w-12 lg:h-12 rounded-full flex items-center justify-center transition-all duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 ${
          isRecording
            ? 'bg-red-500/15 border-2 border-red-500/60 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] animate-pulse'
            : isProcessingVoice
            ? 'bg-indigo-500/15 border-2 border-indigo-500/40 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]'
            : isSpeaking
            ? 'bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] animate-pulse'
            : 'bg-indigo-500/10 border-2 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-400/50 hover:shadow-[0_0_20px_rgba(99,102,241,0.3)]'
        }`}
      >
        {isRecording ? (
          <MicOff className="w-4 h-4 lg:w-5 lg:h-5" />
        ) : isProcessingVoice ? (
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="w-4 h-4 lg:w-5 lg:h-5" />
        ) : (
          <Mic className="w-4 h-4 lg:w-5 lg:h-5" />
        )}
      </button>

      <div className="flex min-w-0 items-center justify-end gap-3 font-mono-data max-md:hidden lg:gap-4">
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-cyan-400" />
          <span className="text-zinc-500">Pendiente</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
          <span className="text-zinc-500">En proceso</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-fuchsia-400" />
          <span className="text-zinc-500">Entregado</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-red-500" />
          <span className="text-zinc-500">Vencida</span>
        </span>
      </div>
    </footer>
  );
};

export default DashboardFooter;
