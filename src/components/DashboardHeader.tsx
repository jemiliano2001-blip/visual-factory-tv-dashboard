import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Monitor, Maximize, Minimize, Palette, Volume2, ChevronRight } from 'lucide-react';
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

// El nombre del cliente ya está en el título de arriba — el breadcrumb solo
// aporta cuando hay más de una página que recorrer.
const Breadcrumbs = ({ current, total }: { current?: number; total?: number }) => {
  if (!total || total <= 1) return null;
  return (
    <div className="hidden md:flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 mt-2">
      <span className="text-zinc-600">Dashboard</span>
      <ChevronRight className="w-3 h-3 text-zinc-700" />
      <span className="text-zinc-400">Pág. {current}/{total}</span>
    </div>
  );
};

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  currentTime: Date;
  currentCompany?: string;
  currentCompanyLogo?: string | null;
  currentPageNum?: number;
  totalPages?: number;
  screenOrderCount: number;
  screenOverdueCount: number;
  screenCriticalCount: number;
  onShowOverdue: () => void;
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
  textFilter?: string;
  onClearFilter: () => void;
  // Speaking
  isSpeaking: boolean;
  isRotationPaused: boolean;
  onResumeRotation: () => void;
  // Navegación
  onNavigateAdmin?: () => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentTime,
  currentCompany,
  currentCompanyLogo,
  currentPageNum,
  totalPages,
  screenOrderCount,
  screenOverdueCount,
  screenCriticalCount,
  onShowOverdue,
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
  textFilter,
  onClearFilter,
  isSpeaking,
  isRotationPaused,
  onResumeRotation,
  onNavigateAdmin,
}) => {
  const isTVMode = viewMode === 'tv';
  const headerLabel = currentCompany ?? 'FÁBRICA VISUAL';

  const iconBtn = (onClick: () => void, isActive: boolean, title: string, children: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-white/8 text-zinc-500 hover:text-zinc-300 hover:border-white/20 hover:bg-white/5'}`}
    >
      {children}
    </button>
  );

  return (
    <header
      className="flex justify-between items-center mb-2 lg:mb-4 pt-2 lg:pt-6 pb-2 lg:pb-3 sticky top-0 z-[60] bg-background flex-shrink-0"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* La pantalla TV prioriza el cliente visible; la marca queda para vistas sin empresa. */}
      <div className="flex min-w-0 max-w-[52vw] flex-col lg:max-w-[60vw]">
      <div className="flex min-w-0 items-center gap-2.5 lg:gap-4">
        {currentCompanyLogo && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white p-1.5 shadow-[0_0_18px_rgba(255,255,255,0.08)] lg:h-14 lg:w-14 lg:rounded-xl lg:p-2">
            <img
              src={currentCompanyLogo}
              alt=""
              className="h-full w-full object-contain"
              onError={(event) => { event.currentTarget.parentElement?.classList.add('hidden'); }}
            />
          </div>
        )}
        {onNavigateAdmin ? (
          <button
            type="button"
            onClick={onNavigateAdmin}
            title="Ir al panel de administración"
            aria-label="Ir al panel de administración"
            className="min-w-0 truncate rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="block truncate font-display text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 lg:text-4xl">
              {headerLabel}
            </span>
          </button>
        ) : (
          <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 lg:text-4xl">
            {headerLabel}
          </h1>
        )}
      </div>
      <Breadcrumbs current={currentPageNum} total={totalPages} />
      </div>

      {/* Center: Speaking indicator */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 6 }}
            className="absolute left-1/2 -translate-x-1/2 top-full mt-2 md:top-3 md:mt-0 flex items-center gap-3 px-5 py-2.5 rounded-full border border-emerald-500/30 shadow-[0_0_25px_rgba(16,185,129,0.2)] z-50"
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
        <div className="hidden md:flex items-center gap-1.5 font-mono-data text-[10px] font-bold uppercase tracking-wider">
          <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-zinc-400">
            {screenOrderCount}<span className="hidden lg:inline"> órdenes</span>
          </span>
          <button
            type="button"
            onClick={onShowOverdue}
            disabled={screenOverdueCount === 0}
            title={screenOverdueCount > 0 ? 'Mostrar órdenes vencidas' : 'No hay órdenes vencidas en esta pantalla'}
            className="min-h-11 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          >
            {screenOverdueCount}<span className="hidden lg:inline"> vencidas</span><span className="lg:hidden"> venc.</span>
          </button>
          <span className={`rounded-md border px-2 py-1 ${
            screenCriticalCount > 0
              ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
              : 'border-white/10 bg-white/[0.03] text-zinc-600'
          }`}>
            {screenCriticalCount}<span className="hidden lg:inline"> críticas</span><span className="lg:hidden"> crít.</span>
          </span>
        </div>

        {(voiceFilter !== 'all' || clientFilter || textFilter) && (
          <button
            type="button"
            onClick={onClearFilter}
            className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-lg font-mono-data font-bold text-[9px] uppercase tracking-widest hover:bg-indigo-500/25 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Quitar filtros"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {[
              voiceFilter === 'overdue' ? 'Vencidas'
                : voiceFilter === 'delivered' ? 'Entregadas'
                : voiceFilter === 'pending' ? 'Pendientes'
                : voiceFilter === 'critical' ? 'Críticas'
                : null,
              clientFilter ? `${clientFilter}` : null,
              textFilter ? `"${textFilter}"` : null,
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

        {isRotationPaused && (
          <div role="status" className="hidden items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200 lg:flex">
            <span>Rotación pausada</span>
            <button type="button" onClick={onResumeRotation} className="min-h-9 rounded-md bg-amber-300 px-2 text-[10px] font-black text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Reanudar
            </button>
          </div>
        )}

        {/* Controles de escritorio — ocultos en móvil */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-px h-6" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
          {iconBtn(onToggleGradient, showGradient, 'Alternar gradiente de fondo', <Palette className="w-4 h-4" />)}
          {iconBtn(onToggleFullscreen, isFullscreen, isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa', isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />)}
          {iconBtn(() => onViewModeChange(isTVMode ? 'desktop' : 'tv'), isTVMode, isTVMode ? 'Modo Escritorio' : 'Modo TV', <Monitor className="w-4 h-4" />)}
          <div className="w-px h-6 ml-1" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
        </div>

        <div className="text-right">
          <div className="font-mono-data text-base md:text-2xl lg:text-3xl font-bold text-cyan-300">{format(currentTime, 'HH:mm')}</div>
          <div className="hidden md:block font-mono-data text-zinc-600 uppercase tracking-widest text-[9px] lg:text-[10px] mt-0.5">{format(currentTime, "EEE dd MMM yyyy")}</div>
        </div>
      </div>
    </header>
  );
};

export default DashboardHeader;
