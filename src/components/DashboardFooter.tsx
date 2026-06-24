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
    <footer className="mt-auto pt-3 pb-2 lg:pb-3 bg-background flex items-center text-[9px] lg:text-[10px] text-zinc-600 uppercase tracking-widest sticky bottom-0 z-[60] flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="flex flex-1 items-center gap-4">
        <div className="font-mono-data">
          <span className="text-zinc-600">Total:</span>{' '}
          <span className="text-indigo-300 font-bold">{totalOrders}</span>{' '}
          <span className="text-zinc-700">órdenes</span>
        </div>

        {pages.length > 1 && (
          <div className="flex gap-1.5 ml-1">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => onPageChange(idx)}
                className={`h-1 rounded-full transition-all duration-500 ${idx === currentPageIndex ? 'w-5 bg-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.6)]' : 'w-1 bg-zinc-700 hover:bg-zinc-500'}`}
              />
            ))}
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
        onClick={onToggleRecording}
        disabled={isProcessingVoice || isSpeaking}
        title={isRecording ? 'Detener grabación' : 'Comando de Voz'}
        className={`relative w-12 h-12 md:w-10 md:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
          isRecording
            ? 'bg-red-500/20 border-2 border-red-500/60 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse'
            : isProcessingVoice
            ? 'bg-indigo-500/15 border-2 border-indigo-500/40 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]'
            : isSpeaking
            ? 'bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse'
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

      <div className="flex-1 flex invisible md:visible items-center justify-end gap-4 lg:gap-5 font-mono-data">
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 shadow-[0_0_6px_rgba(6,182,212,0.7)]" />
          <span className="text-zinc-600">Pendiente</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
          <span className="text-zinc-600">En Proceso</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-500 shadow-[0_0_6px_rgba(217,70,239,0.7)]" />
          <span className="text-zinc-600">Entregado</span>
        </span>
        <span className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
          <span className="text-zinc-600">Vencida</span>
        </span>
      </div>
    </footer>
  );
};

export default DashboardFooter;
