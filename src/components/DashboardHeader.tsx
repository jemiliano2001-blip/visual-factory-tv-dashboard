import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Monitor, Maximize, Minimize, Palette, Volume2,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { OdooConnectionStatus } from '../services/odoo';
import OdooStatusBadge from './OdooStatusBadge';
import { ViewMode } from './OdooOrderCard';

// ─── SoundWave ──────────────────────────────────────────────────────────────────

const SoundWave = () => (
  <div className="flex items-center gap-1 h-8">
    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
      <motion.div
        key={i}
        className="w-1.5 bg-emerald-400 rounded-full"
        animate={{ height: ['20%', '100%', '20%'] }}
        transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }}
      />
    ))}
  </div>
);

// ─── Breadcrumbs ────────────────────────────────────────────────────────────────

const Breadcrumbs = ({ company, current, total }: { company?: string; current?: number; total?: number }) => {
  if (!company) return null;
  return (
    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2">
      <span className="text-zinc-600">Dashboard</span>
      <ChevronRight className="w-3 h-3 text-zinc-700" />
      <span className="text-indigo-400/80">{company}</span>
      {total && total > 1 && (
        <>
          <ChevronRight className="w-3 h-3 text-zinc-700" />
          <span className="text-zinc-400">Pág. {current}/{total}</span>
        </>
      )}
    </div>
  );
};

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  currentTime: Date;
  currentCompany?: string;
  currentPageNum?: number;
  totalPages?: number;
  // Odoo status
  odooStatus: OdooConnectionStatus | null;
  odooLastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  // View controls
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  showGradient: boolean;
  onToggleGradient: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Voice filter
  voiceFilter: string;
  clientFilter?: string | null;
  onClearFilter: () => void;
  // Speaking
  isSpeaking: boolean;
  // Navigation
  onNavigateAdmin: () => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentTime,
  currentCompany,
  currentPageNum,
  totalPages,
  odooStatus,
  odooLastUpdated,
  isRefreshing,
  onRefresh,
  viewMode,
  onViewModeChange,
  showGradient,
  onToggleGradient,
  isFullscreen,
  onToggleFullscreen,
  voiceFilter,
  clientFilter,
  onClearFilter,
  isSpeaking,
  onNavigateAdmin,
}) => {
  const isTVMode = viewMode === 'tv';

  return (
    <header className="flex justify-between items-end mb-4 lg:mb-6 border-b border-zinc-800 pb-4 relative z-10 flex-shrink-0">
      <div>
        <h1
          onClick={onNavigateAdmin}
          className="text-2xl lg:text-4xl font-bold tracking-tighter text-zinc-100 cursor-pointer hover:text-indigo-400 transition-colors"
          title="Ir a Configuración"
        >
          FÁBRICA VISUAL
        </h1>
        <Breadcrumbs company={currentCompany} current={currentPageNum} total={totalPages} />
      </div>

      {/* Speaking indicator */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className="absolute left-1/2 -translate-x-1/2 top-6 flex items-center gap-4 bg-zinc-900/80 backdrop-blur-md px-6 py-3 rounded-full border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.2)] z-50"
          >
            <Volume2 className="w-5 h-5 text-emerald-400 animate-pulse" />
            <SoundWave />
            <span className="text-emerald-400 font-bold uppercase tracking-widest text-sm ml-2">IA Respondiendo</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="text-right flex items-center gap-3">
        {(voiceFilter !== 'all' || clientFilter) && (
          <button
            onClick={onClearFilter}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-indigo-500/30 transition-all"
            title="Quitar filtro de voz"
          >
            <div className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            Filtro: {[
              voiceFilter === 'overdue' ? 'Vencidas'
                : voiceFilter === 'delivered' ? 'Entregadas'
                : voiceFilter === 'pending' ? 'Pendientes'
                : voiceFilter === 'critical' ? 'Críticas'
                : null,
              clientFilter ? `Cliente: ${clientFilter}` : null,
            ].filter(Boolean).join(' · ')}
            <span className="ml-1 opacity-70 hover:opacity-100">×</span>
          </button>
        )}

        <OdooStatusBadge
          status={odooStatus}
          lastUpdated={odooLastUpdated}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />

        <div className="w-px h-8 bg-zinc-800" />

        <button
          onClick={onToggleGradient}
          className={`p-2 rounded-lg border transition-all ${showGradient ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:text-zinc-300'}`}
          title="Alternar Gradiente de Fondo"
        >
          <Palette className="w-5 h-5" />
        </button>
        <button
          onClick={onToggleFullscreen}
          className={`p-2 rounded-lg border transition-all ${isFullscreen ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:text-zinc-300'}`}
          title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
        <button
          onClick={() => onViewModeChange(isTVMode ? 'desktop' : 'tv')}
          className={`p-2 rounded-lg border transition-all ${isTVMode ? 'bg-indigo-500 border-indigo-400 text-white' : 'bg-zinc-900 border-white/5 text-zinc-500 hover:text-zinc-300'}`}
          title={isTVMode ? 'Modo Escritorio (con scroll)' : 'Modo TV (sin scroll)'}
        >
          <Monitor className="w-5 h-5" />
        </button>
        <div>
          <div className="text-3xl font-bold text-emerald-400">{format(currentTime, 'HH:mm:ss')}</div>
          <div className="text-zinc-500 uppercase tracking-widest text-sm">{format(currentTime, 'MMM dd, yyyy')}</div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
