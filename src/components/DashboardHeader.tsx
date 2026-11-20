import React from 'react';
import { Monitor, Maximize, Minimize, Palette, ChevronRight, Clock, TreePine, Sparkles, Crown, Heart, Flower2 } from 'lucide-react';
import { OdooConnectionStatus } from '../services/odoo';
import OdooStatusBadge from './OdooStatusBadge';
import { ViewMode } from './OdooOrderCard';
import CompanyBadge from './CompanyBadge';
import { getSmartCompanyName } from '../utils/customerNames';
import DashboardClock from './DashboardClock';
import { AURORA_LABEL, type AuroraMode } from '../services/auroraMode';
import { holidayGreeting, type HolidayIcon, type HolidayTheme } from '../services/holidayTheme';
import HolidayGarland from './HolidayGarland';

const HOLIDAY_ICONS: Record<HolidayIcon, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  TreePine, Sparkles, Crown, Heart, Flower2,
};

// ─── Breadcrumbs ────────────────────────────────────────────────────────────────

// El nombre del cliente ya está en el título de arriba — el breadcrumb solo
// aporta cuando hay más de una página que recorrer.
const Breadcrumbs = ({ current, total }: { current?: number; total?: number }) => {
  if (!total || total <= 1) return null;
  return (
    <div className="hidden md:flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mt-2">
      <span className="text-muted-foreground/70">Dashboard</span>
      <ChevronRight className="w-3 h-3 text-muted-foreground/50" />
      <span className="text-muted-foreground">Pág. {current}/{total}</span>
    </div>
  );
};

// ─── Props ──────────────────────────────────────────────────────────────────────

interface DashboardHeaderProps {
  currentTime?: Date;
  currentCompany?: string;
  currentCompanyLogo?: string | null;
  currentCompanyDeliverySchedule?: string | null;
  currentPageNum?: number;
  totalPages?: number;
  screenOrderCount: number;
  screenOverdueCount: number;
  screenCriticalCount: number;
  onShowOverdue: () => void;
  // Odoo status
  odooStatus: OdooConnectionStatus | null;
  odooLastUpdated: string | null;
  odooTruncated: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  // View controls
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  auroraMode: AuroraMode;
  onCycleAurora: () => void;
  /** Festivo vigente (solo TV de escritorio); muestra un saludo junto al título. */
  holiday?: HolidayTheme | null;
  holidayDate?: Date;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  // Filtro de estado
  statusFilter: string;
  clientFilter?: string | null;
  textFilter?: string;
  onClearFilter: () => void;
  // Speaking
  isRotationPaused: boolean;
  onResumeRotation: () => void;
  // Navegación
  onNavigateAdmin?: () => void;
}

// ─── Componente ─────────────────────────────────────────────────────────────────

const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  currentTime,
  currentCompany,
  currentCompanyLogo: _unusedLogo,
  currentCompanyDeliverySchedule,
  currentPageNum,
  totalPages,
  screenOrderCount,
  screenOverdueCount,
  screenCriticalCount,
  onShowOverdue,
  odooStatus,
  odooLastUpdated,
  odooTruncated,
  isRefreshing,
  onRefresh,
  viewMode,
  onViewModeChange,
  auroraMode,
  onCycleAurora,
  holiday = null,
  holidayDate,
  isFullscreen,
  onToggleFullscreen,
  statusFilter,
  clientFilter,
  textFilter,
  onClearFilter,
  isRotationPaused,
  onResumeRotation,
  onNavigateAdmin,
}) => {
  const isTVMode = viewMode === 'tv';
  const headerLabel = currentCompany ? getSmartCompanyName(currentCompany, 'header') : 'FÁBRICA VISUAL';

  const iconBtn = (onClick: () => void, isActive: boolean, title: string, children: React.ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${isActive ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' : 'border-border text-muted-foreground hover:text-secondary-foreground hover:border-white/20 hover:bg-white/5'}`}
    >
      {children}
    </button>
  );

  return (
    <header
      className={`flex justify-between items-center mb-2 lg:mb-4 pt-2 lg:pt-6 pb-2 lg:pb-3 sticky top-0 z-[60] flex-shrink-0 ${
        // TV: nada pasa por debajo, la cortina de luz se ve a través. Escritorio: cristal
        // para que las tarjetas no se lean bajo el header al hacer scroll. Móvil: sólido.
        isTVMode ? '' : 'bg-background md:bg-background/70 md:backdrop-blur-xl'
      }`}
      style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
    >
      {holiday && <HolidayGarland kind={holiday.garland} />}
      {/* La pantalla TV prioriza el cliente visible; la marca queda para vistas sin empresa. */}
      <div className="flex min-w-0 max-w-[52vw] flex-col lg:max-w-[60vw]">
      <div className="flex min-w-0 items-center gap-2.5 lg:gap-4">
        <CompanyBadge
          company={currentCompany || 'SMV'}
          size="lg"
          className="lg:h-14 lg:w-14 lg:rounded-2xl"
        />
        <div className="min-w-0 flex flex-col justify-center">
          {onNavigateAdmin ? (
            <button
              type="button"
              onClick={onNavigateAdmin}
              title="Ir al panel de administración"
              aria-label="Ir al panel de administración"
              className="min-w-0 truncate rounded-lg text-left transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="block truncate font-display text-xl font-extrabold tracking-tight text-foreground lg:text-4xl">
                {headerLabel}
              </span>
            </button>
          ) : (
            <h1 className="truncate font-display text-xl font-extrabold tracking-tight text-foreground lg:text-4xl">
              {headerLabel}
            </h1>
          )}

          {currentCompanyDeliverySchedule && (
            <div className="flex items-center gap-1.5 mt-0.5 text-cyan-300 font-mono-data text-[11px] lg:text-xs font-semibold tracking-wide truncate">
              <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" aria-hidden="true" />
              <span className="truncate">Horario: {currentCompanyDeliverySchedule}</span>
            </div>
          )}
        </div>
      </div>
      <Breadcrumbs current={currentPageNum} total={totalPages} />
      </div>

      {holiday && (() => {
        const Icon = HOLIDAY_ICONS[holiday.icon];
        return (
          <div
            className="hidden lg:flex shrink-0 items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold text-foreground"
            style={{ borderColor: `rgba(${holiday.accent}, 0.35)`, backgroundColor: `rgba(${holiday.accent}, 0.10)` }}
          >
            <span style={{ color: `rgb(${holiday.accent})` }}><Icon className="h-4 w-4" aria-hidden /></span>
            <span>{holidayGreeting(holiday, holidayDate ?? new Date())}</span>
          </div>
        );
      })()}

      {/* Right: controls + clock */}
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="hidden md:flex items-center gap-1.5 font-mono-data text-[10px] font-bold uppercase tracking-wider">
          <span className="inline-flex h-9 items-center gap-1 rounded-md border border-input bg-white/[0.03] px-2.5 text-muted-foreground">
            {screenOrderCount}<span className="hidden lg:inline"> órdenes</span>
          </span>
          <button
            type="button"
            onClick={onShowOverdue}
            disabled={screenOverdueCount === 0}
            title={screenOverdueCount > 0 ? 'Mostrar órdenes vencidas' : 'No hay órdenes vencidas en esta pantalla'}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 text-red-300 transition-colors hover:bg-red-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:border-input disabled:bg-white/[0.03] disabled:text-muted-foreground/70"
          >
            {screenOverdueCount}<span className="hidden lg:inline"> vencidas</span><span className="lg:hidden"> venc.</span>
          </button>
          <span className={`inline-flex h-9 items-center gap-1 rounded-md border px-2.5 ${
            screenCriticalCount > 0
              ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
              : 'border-input bg-white/[0.03] text-muted-foreground/70'
          }`}>
            {screenCriticalCount}<span className="hidden lg:inline"> críticas</span><span className="lg:hidden"> crít.</span>
          </span>
        </div>

        {(statusFilter !== 'all' || clientFilter || textFilter) && (
          <button
            type="button"
            onClick={onClearFilter}
            className="flex h-9 items-center gap-1.5 px-3 bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 rounded-md font-mono-data font-bold text-[9px] uppercase tracking-wider hover:bg-indigo-500/25 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            title="Quitar filtros"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
            {[
              statusFilter === 'overdue' ? 'Vencidas'
                : statusFilter === 'delivered' ? 'Entregadas'
                : statusFilter === 'pending' ? 'Pendientes'
                : statusFilter === 'critical' ? 'Críticas'
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
          truncated={odooTruncated}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />

        {isRotationPaused && (
          <div role="status" className="hidden items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 lg:flex">
            <span>Rotación pausada</span>
            <button type="button" onClick={onResumeRotation} className="min-h-9 rounded-md bg-amber-300 px-2 text-[10px] font-bold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              Reanudar
            </button>
          </div>
        )}

        {/* Controles de escritorio — ocultos en móvil */}
        <div className="hidden md:flex items-center gap-2">
          {iconBtn(onCycleAurora, auroraMode !== 'oled-minimal', `Fondo: ${AURORA_LABEL[auroraMode]} (clic para cambiar)`, <Palette className="w-4 h-4" />)}
          {iconBtn(onToggleFullscreen, isFullscreen, isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa', isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />)}
          {iconBtn(() => onViewModeChange(isTVMode ? 'desktop' : 'tv'), isTVMode, isTVMode ? 'Modo Escritorio' : 'Modo TV', <Monitor className="w-4 h-4" />)}
        </div>

        <DashboardClock />
      </div>
    </header>
  );
};

export default DashboardHeader;
