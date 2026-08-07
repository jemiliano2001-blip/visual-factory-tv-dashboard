import React from 'react';
import { motion } from 'framer-motion';
import {
  Clock, AlertTriangle, CheckCircle2, PlayCircle,
  Package, User, Calendar, FileText, Check, Timer,
} from 'lucide-react';
import { format } from 'date-fns';
import { OdooSaleOrder, OdooOrderLine, getOrderPriority, getDeliveryProgress, isOrderOverdue, parseOdooDate, getOrderAgeDays, formatOrderAge, getDeliveryTimeStatus, STALE_AGE_DAYS } from '../services/odoo';
import SmartText from './SmartText';

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export type ViewMode = 'tv' | 'desktop';
export type ScreenTier = 'sm' | 'md' | 'lg' | 'xl';

interface OdooOrderCardProps {
  order: OdooSaleOrder;
  companyBadge?: { name: string; logoUrl: string | null };
  isHighlighted: boolean;
  isWide: boolean;
  isDense?: boolean;
  isMobile?: boolean;
  screenTier?: ScreenTier;
  viewMode: ViewMode;
  onClick?: () => void;
}

// ─── Constantes de estilo ───────────────────────────────────────────────────────

const DELIVERY_STATE_LABEL: Record<string, string> = {
  done:      'Entregada',
  assigned:  'Lista',
  waiting:   'En espera',
  confirmed: 'Confirmada',
  draft:     'Borrador',
};

const DELIVERY_STATE_COLOR: Record<string, string> = {
  done:      'text-emerald-400 border-emerald-800/60',
  assigned:  'text-cyan-400 border-cyan-800/60',
  waiting:   'text-amber-400 border-amber-800/60',
  confirmed: 'text-amber-400 border-amber-800/60',
  draft:     'text-zinc-500 border-zinc-700/60',
};

const PRIORITY_COLORS: Record<string, string> = {
  low:      'bg-zinc-800/80 text-zinc-300 border-zinc-600',
  normal:   'bg-blue-600/20 text-blue-300 border-blue-400 shadow-[0_0_10px_rgba(96,165,250,0.3)]',
  high:     'bg-orange-500/20 text-orange-300 border-orange-400 shadow-[0_0_15px_rgba(251,146,60,0.4)]',
  critical: 'bg-red-600 text-white border-red-400 shadow-[0_0_25px_rgba(239,68,68,0.8)] animate-pulse',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Vencida',
};

// ─── Componente ─────────────────────────────────────────────────────────────────

const OdooOrderCard: React.FC<OdooOrderCardProps> = ({
  order,
  companyBadge,
  isHighlighted,
  isWide,
  isDense,
  isMobile,
  viewMode,
  onClick,
}) => {
  const priority = getOrderPriority(order);
  const progress = getDeliveryProgress(order);
  const isCritical = priority === 'critical';
  const isOverdue = isOrderOverdue(order);
  const commitmentDate = parseOdooDate(order.commitment_date);
  const isDesktop = viewMode === 'desktop';
  const ageDays = getOrderAgeDays(order);
  const isStale = ageDays !== null && ageDays > STALE_AGE_DAYS;

  // ── Tiempo de entrega parseado de la nota ("8 a 12 días hábiles", "4 semanas") ──
  const deliveryTime = getDeliveryTimeStatus(order);
  const dtRemaining = deliveryTime.businessDaysRemaining;
  const hasDeliveryTime = deliveryTime.status !== 'unknown' && dtRemaining !== null;
  const dtLabel = !hasDeliveryTime ? ''
    : dtRemaining < 0 ? `Venció hace ${-dtRemaining} d`
    : dtRemaining === 0 ? 'Entrega hoy'
    : `${dtRemaining} d háb.`;
  const dtBadgeColor =
    deliveryTime.status === 'overdue' ? 'bg-red-500/15 text-red-400 border-red-500/40'
    : deliveryTime.status === 'warning' ? 'bg-amber-500/15 text-amber-400 border-amber-500/40'
    : 'bg-zinc-800 text-zinc-400 border-zinc-700';
  const dtTitle = deliveryTime.daysRange && deliveryTime.deadlineDate
    ? `Tiempo de entrega en nota: ${deliveryTime.daysRange.min}–${deliveryTime.daysRange.max} días hábiles — límite ${format(deliveryTime.deadlineDate, 'dd/MM/yy')}`
    : undefined;

  // ── Resumen de remisiones (excluye canceladas) ─────────────────────────────
  const deliveries = order.deliveries ?? [];
  const deliveryCounts: Record<string, number> = {};
  for (const d of deliveries) {
    if (d.state !== 'cancel') {
      deliveryCounts[d.state] = (deliveryCounts[d.state] ?? 0) + 1;
    }
  }
  const deliveryStates = ['done', 'assigned', 'waiting', 'confirmed', 'draft'].filter(
    s => (deliveryCounts[s] ?? 0) > 0,
  );

  // ── Colores por estado ──────────────────────────────────────────────────────
  const cardBorder = isHighlighted
    ? 'bg-primary/10 border-primary/60 shadow-[0_0_45px_rgba(99,102,241,0.35)] z-50 scale-105'
    : isCritical
    ? 'bg-red-950/40 border-red-500/55 shadow-[0_0_18px_rgba(220,38,38,0.28)]'
    : isOverdue
    ? 'bg-orange-950/25 border-orange-500/55 ring-1 ring-orange-500/20'
    : progress >= 100
    ? 'bg-card/70 border-fuchsia-400/30 hover:border-fuchsia-300/50'
    : progress > 0
    ? 'bg-card/70 border-emerald-400/30 hover:border-emerald-300/50'
    : 'bg-card/70 border-border hover:border-cyan-400/30';

  const accentStripeColor = isHighlighted
    ? 'bg-primary'
    : isCritical || isOverdue
    ? 'bg-red-500'
    : progress >= 100
    ? 'bg-fuchsia-400'
    : progress > 0
    ? 'bg-emerald-400'
    : 'bg-cyan-500/80';

  const progressColor =
    progress >= 100 ? 'bg-fuchsia-400'
    : progress > 0   ? 'bg-emerald-400'
    : 'bg-cyan-400';

  const glowColor =
    progress >= 100 ? 'bg-fuchsia-500'
    : progress > 0   ? 'bg-emerald-500'
    : 'bg-cyan-500';

  // Distintivo de antigüedad (>1 mes): ring ámbar ADITIVO, sin tapar el color de
  // estado. Se omite si la card ya tiene su propio realce (resaltada/crítica/vencida).
  const staleRing = isStale && !isHighlighted && !isCritical && !isOverdue ? 'ring-1 ring-amber-500/40' : '';

  const StatusIcon = progress >= 100
    ? <CheckCircle2 className="w-5 h-5 text-fuchsia-400 drop-shadow-[0_0_8px_rgba(232,121,249,0.5)]" />
    : progress > 0
    ? <PlayCircle className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
    : <Clock className="w-5 h-5 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" />;

  const statusLabel =
    progress >= 100 ? 'Entregado'
    : progress > 0  ? 'En Proceso'
    : 'Pendiente';

  const statusTextColor =
    progress >= 100 ? 'text-fuchsia-400'
    : progress > 0  ? 'text-emerald-400'
    : 'text-cyan-400';

  // ── Mobile layout (lista compacta para móviles) ────────────────────────────
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        id={`so-${order.name.replace(/\//g, '-')}`}
        onClick={onClick}
        className={`flex flex-col rounded-xl border transition-all duration-300 relative overflow-hidden ${cardBorder} ${staleRing} pl-4 pr-3.5 py-3 gap-2 min-h-[72px] ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      >
        {/* Banda de acento (color = progreso) */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${accentStripeColor}`} />

        {/* Fila 1: SO + prioridad + edad */}
        <div className="flex justify-between items-start gap-2 relative z-10">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-black tracking-tight text-white truncate pr-2 font-mono-data">
              {order.name}
            </h3>
            <div className="text-xs text-zinc-400 font-semibold truncate mt-0.5">
              {order.partner_name}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${PRIORITY_COLORS[priority]}`}>
              {PRIORITY_LABELS[priority]}
            </span>
            {hasDeliveryTime && (
              <span className={`text-[11px] font-black px-2 py-0.5 rounded border ${dtBadgeColor}`}>
                {dtLabel}
              </span>
            )}
            {isStale && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40">
                {formatOrderAge(ageDays!)}
              </span>
            )}
          </div>
        </div>

        {/* Fila 2: producto principal */}
        <div className="flex items-center gap-1.5 z-10 mt-0.5 min-w-0">
          <Package className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
          <SmartText
            text={order.lines[0]?.name || order.main_product}
            maxLines={1}
            className="text-sm text-zinc-200 font-medium"
            defaultLevel={2}
          />
          {order.lines.length > 1 && (
            <span className="text-[10px] font-black text-zinc-500 shrink-0">
              +{order.lines.length - 1}
            </span>
          )}
        </div>

        {/* Fila 3: estado + barra + piezas */}
        <div className="mt-1 relative z-10 flex items-center gap-2">
          <div className="flex items-center gap-1 shrink-0">
            {StatusIcon}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${statusTextColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="flex-1 bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5 mx-1">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${progressColor}`}
              style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
            />
          </div>
          <div className="flex items-baseline gap-1.5 shrink-0">
            <span className="text-sm font-black text-white leading-none font-mono-data">
              {progress}%
            </span>
            {order.qty_total > 0 && (
              <span className="text-[11px] font-bold text-zinc-400 font-mono-data leading-none">
                {order.qty_delivered}/{order.qty_total}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Dense layout (muchas cards, poco espacio) ───────────────────────────────
  if (isDense) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: isHighlighted ? 1.02 : 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        id={`so-${order.name.replace(/\//g, '-')}`}
        onClick={onClick}
        className={`flex items-center rounded-2xl border-2 transition-all duration-300 relative overflow-hidden h-full ${cardBorder} ${staleRing} p-3 lg:p-4 gap-3 lg:gap-4 min-h-0 ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      >
        {isOverdue && (
          <div className="absolute top-0 right-0 bg-orange-500 w-2 h-full z-20" title="Vencida" />
        )}
        <div className="flex-shrink-0 relative z-10">
          {StatusIcon}
        </div>
        
        <div className="flex flex-col flex-1 min-w-0 relative z-10 justify-center overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <h3 className="text-sm lg:text-base font-black tracking-tight text-white truncate">
                {order.name}
              </h3>
              {companyBadge && (
                <span className="inline-flex max-w-[42%] items-center gap-1 truncate rounded border border-indigo-400/30 bg-zinc-800/90 px-1 py-0.5 text-[7px] font-black uppercase tracking-wider text-zinc-300 lg:text-[8px]">
                  {companyBadge.logoUrl && (
                    <img src={companyBadge.logoUrl} alt="" className="h-2.5 max-w-5 object-contain" />
                  )}
                  <span className="truncate">{companyBadge.name}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {hasDeliveryTime && (
                <span className={`text-[8px] lg:text-[9px] font-black px-1 py-0.5 rounded border ${dtBadgeColor}`} title={dtTitle}>
                  {dtLabel}
                </span>
              )}
              {isStale && (
                <span className="text-[8px] lg:text-[9px] font-black px-1 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40" title={`Creada hace ${formatOrderAge(ageDays!)}`}>
                  {formatOrderAge(ageDays!)}
                </span>
              )}
              <span className={`text-[8px] lg:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[priority]}`}>
                {PRIORITY_LABELS[priority]}
              </span>
            </div>
          </div>
          
          <div className="text-[10px] lg:text-xs font-bold text-zinc-300 mb-1.5 min-h-0 overflow-hidden flex items-center gap-1">
            <SmartText
              text={order.lines[0]?.name || order.main_product}
              maxLines={1}
              defaultLevel={2}
            />
            {order.lines.length > 1 && (
              <span className="text-[8px] lg:text-[9px] font-black px-1 py-0.5 rounded bg-zinc-700/60 text-zinc-400 border border-zinc-600/50 flex-shrink-0">
                +{order.lines.length - 1}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/40 h-1.5 lg:h-2 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${progressColor}`}
                style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
              />
            </div>
            <div className="flex flex-col items-end min-w-[40px]">
              <span className={`text-[10px] lg:text-xs font-black ${statusTextColor} leading-none mb-0.5`}>
                {progress}%
              </span>
              <span className="text-[8px] lg:text-[9px] text-zinc-500 font-bold leading-none">
                {order.qty_delivered}/{order.qty_total}
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // ── Normal / Wide layout ────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: isHighlighted ? 1.05 : 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
      id={`so-${order.name.replace(/\//g, '-')}`}
      onClick={onClick}
      className={`flex flex-col rounded-2xl border transition-all duration-500 relative overflow-hidden h-full min-h-0 ${cardBorder} ${staleRing} ${isWide ? 'p-5 xl:p-7' : 'p-3.5 lg:p-4'} ${onClick ? 'cursor-pointer active:scale-[0.98]' : ''}`}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      {/* Left accent stripe */}
      <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl ${accentStripeColor}`} />

      {/* Overdue badge */}
      {isOverdue && (
        <div className="absolute top-0 right-0 bg-orange-500/90 text-white px-3 py-1 rounded-bl-xl font-black text-[9px] uppercase tracking-[0.2em] flex items-center gap-1.5 z-20">
          <AlertTriangle className="w-2.5 h-2.5 animate-bounce" />
          Vencida
        </div>
      )}

      {/* Background glow */}
      <div className={`absolute -top-12 -right-12 w-40 h-40 blur-[70px] rounded-full opacity-10 pointer-events-none ${glowColor}`} />

      {/* Header: SO number + priority */}
      <div className="flex justify-between items-start mb-2.5 lg:mb-3 relative z-10 mt-2 min-h-0">
        <div className="flex-1 min-w-0 pl-2">
          <h3 className={`${isWide ? 'text-2xl xl:text-3xl' : 'text-lg lg:text-xl'} font-bold tracking-tight text-white mb-1 truncate font-mono-data`}>
            {order.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3 h-3 text-zinc-500 flex-shrink-0" />
              <SmartText
                text={order.partner_name}
                maxLines={1}
                className={`${isWide ? 'text-sm' : 'text-xs'} font-bold text-zinc-300 uppercase tracking-[0.15em]`}
                defaultLevel={2}
              />
            </div>
            {companyBadge && (
              <span className="inline-flex max-w-full items-center gap-1 rounded border border-indigo-400/30 bg-zinc-800/90 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-zinc-300">
                {companyBadge.logoUrl && (
                  <img src={companyBadge.logoUrl} alt="" className="h-3 max-w-7 object-contain" />
                )}
                <span className="truncate">{companyBadge.name}</span>
              </span>
            )}
            {commitmentDate && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 bg-zinc-800 border flex-shrink-0 ${isOverdue ? 'text-red-400 border-red-500/30' : 'text-zinc-500 border-zinc-700'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {format(commitmentDate, 'dd/MM/yy')}
              </span>
            )}
            {hasDeliveryTime && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 border flex-shrink-0 ${dtBadgeColor}`} title={dtTitle}>
                <Timer className="w-2.5 h-2.5" />
                {dtLabel}
              </span>
            )}
            {isStale && (
              <span className="text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/40 flex-shrink-0" title={`Creada hace ${formatOrderAge(ageDays!)}`}>
                <Clock className="w-2.5 h-2.5" />
                {formatOrderAge(ageDays!)}
              </span>
            )}
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ml-2 flex-shrink-0 ${PRIORITY_COLORS[priority]}`}>
          {PRIORITY_LABELS[priority]}
        </span>
      </div>

      {/* Product lines — lista compacta de todas las líneas */}
      <div className={`relative z-10 mb-2 lg:mb-3 pl-2 min-h-0 overflow-hidden`}>
        <div className="flex flex-col gap-1">
          {(isDesktop ? order.lines : order.lines.slice(0, 3)).map((line: OdooOrderLine, idx: number) => {
            const lineComplete = line.qty > 0 && line.delivered >= line.qty;
            return (
              <div key={idx} className="flex items-center gap-1.5 min-w-0">
                {lineComplete
                  ? <Check className={`${isWide ? 'w-3.5 h-3.5' : 'w-3 h-3'} flex-shrink-0 text-fuchsia-400`} />
                  : <Package className={`${isWide ? 'w-3.5 h-3.5' : 'w-3 h-3'} flex-shrink-0 text-zinc-500`} />
                }
                <SmartText
                  text={line.name}
                  className={`${isWide ? 'text-sm' : 'text-xs'} font-semibold ${lineComplete ? 'text-zinc-500 line-through' : 'text-zinc-100'} leading-tight`}
                  maxLines={1}
                  defaultLevel={2}
                />
                <span className={`${isWide ? 'text-[10px]' : 'text-[9px]'} font-black flex-shrink-0 font-mono-data ${lineComplete ? 'text-fuchsia-400/70' : 'text-zinc-500'}`}>
                  {line.delivered}/{line.qty}
                </span>
              </div>
            );
          })}
          {!isDesktop && order.lines.length > 3 && (
            <span className={`${isWide ? 'text-xs' : 'text-[10px]'} text-zinc-500 font-bold pl-5`}>
              +{order.lines.length - 3} más
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-auto relative z-10 min-h-0 pl-2">
        <div className="flex justify-between items-end mb-2 lg:mb-2.5">
          <div className="flex items-center gap-1.5">
            {StatusIcon}
            <span className={`${isWide ? 'text-xs' : 'text-[9px] lg:text-[10px]'} font-bold uppercase tracking-[0.12em] ${statusTextColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-right flex items-baseline gap-1.5">
            <span className={`${isWide ? 'text-2xl xl:text-3xl' : 'text-lg lg:text-xl'} font-black text-white font-mono-data`}>
              {progress}%
            </span>
            {order.qty_total > 0 && (
              <span className={`${isWide ? 'text-xs' : 'text-[9px]'} font-bold text-zinc-500 font-mono-data`}>
                {order.qty_delivered}/{order.qty_total}
              </span>
            )}
          </div>
        </div>

        <div className={`${isWide ? 'h-3' : 'h-2 lg:h-2.5'} bg-black/50 rounded-full overflow-hidden border border-white/5`}>
          <div
            className={`h-full rounded-full transition-all duration-1000 relative ${progressColor}`}
            style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-transparent" />
          </div>
        </div>

        {/* Lines count + salesperson */}
        <div className="flex justify-between items-center mt-2">
          <div className="flex items-center gap-1 text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
            <FileText className="w-2.5 h-2.5" />
            {order.lines_count} {order.lines_count === 1 ? 'línea' : 'líneas'}
          </div>
          {order.salesperson && (
            <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider truncate max-w-[120px]">
              {order.salesperson}
            </div>
          )}
        </div>

        {/* Remisiones */}
        {deliveryStates.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`${isWide ? 'text-[10px]' : 'text-[9px]'} text-zinc-600 font-bold uppercase tracking-wider shrink-0`}>
              Rem.
            </span>
            {deliveryStates.map(state => (
              <span
                key={state}
                className={`${isWide ? 'text-[10px]' : 'text-[9px]'} font-black px-1.5 py-0.5 rounded border ${DELIVERY_STATE_COLOR[state]}`}
              >
                {deliveryCounts[state]} {DELIVERY_STATE_LABEL[state]}{(deliveryCounts[state] ?? 0) > 1 ? 's' : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default OdooOrderCard;
