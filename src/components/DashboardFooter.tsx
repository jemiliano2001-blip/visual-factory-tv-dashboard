import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Volume2 } from 'lucide-react';

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardFooterProps {
  totalOrders: number;
  // Pagination
  pages: { company: string }[];
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
    <footer className="mt-auto pt-4 border-t border-zinc-800 flex justify-between items-center text-[10px] lg:text-xs text-zinc-500 uppercase tracking-widest relative z-10 flex-shrink-0">
      <div className="flex items-center gap-4">
        <div>
          Órdenes a Facturar:{' '}
          <span className="text-violet-300 font-bold">{totalOrders}</span>
        </div>

        {pages.length > 1 && (
          <div className="flex gap-1.5 ml-2">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => onPageChange(idx)}
                className={`h-1.5 rounded-full transition-all duration-500 ${idx === currentPageIndex ? 'w-6 bg-indigo-500' : 'w-1.5 bg-zinc-700 hover:bg-zinc-500'}`}
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
        className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold transition-all ${
          isRecording
            ? 'bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse'
            : isProcessingVoice
            ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 animate-pulse'
            : isSpeaking
            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 animate-pulse'
            : 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:bg-zinc-800 hover:text-zinc-300'
        }`}
      >
        {isRecording ? (
          <MicOff className="w-4 h-4" />
        ) : isProcessingVoice ? (
          <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="w-4 h-4" />
        ) : (
          <Mic className="w-4 h-4" />
        )}
        {isRecording ? 'Escuchando...' : isProcessingVoice ? 'Procesando...' : isSpeaking ? 'IA Hablando...' : 'Comando de Voz'}
      </button>

      <div className="flex gap-6 items-center">
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" /> Pendiente
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" /> En Proceso
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-fuchsia-400 shadow-[0_0_8px_rgba(232,121,249,0.8)]" /> Entregado
        </span>
        <span className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.8)]" /> Vencida
        </span>
      </div>
    </footer>
  );
};

export default DashboardFooter;
