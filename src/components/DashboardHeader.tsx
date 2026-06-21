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

  const iconBtn = (onClick: () => void, isActive: boolean, title: string, children: React.ReactNode) => (
    <button
      onClick={onClick}
      title={title}
      className={`p-2 rounded-lg border transition-all duration-200 ${isActive ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
    >
      {children}
    </button>
  );

  return (
    <header
      className="flex justify-between items-center mb-3 lg:mb-4 pb-3 relative z-10 flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Left: Brand + breadcrumbs */}
      <div>
        <h1
          onClick={onNavigateAdmin}
          className="font-display text-xl lg:text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 cursor-pointer hover:from-indigo-300 hover:to-cyan-300 transition-all"
          title="Ir a Configuración"
        >
          FÁBRICA VISUAL
        </h1>
        <Breadcrumbs company={currentCompany} current={currentPageNum} total={totalPages} />
      </div>

      {/* Center: Speaking indicator */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 6 }}
            className="absolute left-1/2 -translate-x-1/2 top-3 flex items-center gap-3 px-5 py-2.5 rounded-full border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.2)] z-50"
            style={{ backgroundColor: 'rgba(10,10,15,0.9)', backdropFilter: 'blur(16px)' }}
          >
            <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
            <SoundWave />
            <span className="text-emerald-400 font-mono-data font-bold uppercase tracking-widest text-xs">IA Respondiendo</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right: controls + clock */}
      <div className="flex items-center gap-2 lg:gap-3">
        {(voiceFilter !== 'all' || clientFilter) && (
          <button
            onClick={onClearFilter}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg font-mono-data font-bold text-[9px] uppercase tracking-widest hover:bg-indigo-500/25 transition-all"
            title="Quitar filtro de voz"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {[
              voiceFilter === 'overdue' ? 'Vencidas'
                : voiceFilter === 'delivered' ? 'Entregadas'
                : voiceFilter === 'pending' ? 'Pendientes'
                : voiceFilter === 'critical' ? 'Críticas'
                : null,
              clientFilter ? `${clientFilter}` : null,
            ].filter(Boolean).join(' · ')}
            <span className="opacity-50">×</span>
          </button>
        )}

        <OdooStatusBadge
          status={odooStatus}
          lastUpdated={odooLastUpdated}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />

        <div className="w-px h-6" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />

        {iconBtn(onToggleGradient, showGradient, 'Alternar Gradiente', <Palette className="w-4 h-4" />)}
        {iconBtn(onToggleFullscreen, isFullscreen, isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa', isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />)}
        {iconBtn(() => onViewModeChange(isTVMode ? 'desktop' : 'tv'), isTVMode, isTVMode ? 'Modo Escritorio' : 'Modo TV', <Monitor className="w-4 h-4" />)}

        <div className="w-px h-6 ml-1" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />

        <div className="text-right">
          <div className="font-mono-data text-2xl lg:text-3xl font-bold text-cyan-400" style={{ textShadow: '0 0 20px rgba(6,182,212,0.5)' }}>{format(currentTime, 'HH:mm:ss')}</div>
          <div className="font-mono-data text-zinc-600 uppercase tracking-widest text-[9px] lg:text-[10px] mt-0.5">{format(currentTime, "EEE dd MMM yyyy")}</div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
