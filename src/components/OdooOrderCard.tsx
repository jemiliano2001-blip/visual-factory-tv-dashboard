import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Check, CheckCircle2, Clock, Package, PlayCircle } from 'lucide-react';
import { OdooSaleOrder, OdooOrderLine, getDeliveryProgress, getOrderPriority, isOrderOverdue } from '../services/odoo';
import { getCardPresentation, isLargeTVCard } from '../services/cardPresentation';
import SmartText from './SmartText';
import { Badge } from './ui/badge';

export type ViewMode = 'tv' | 'desktop';
export type ScreenTier = 'sm' | 'md' | 'lg' | 'xl';

interface OdooOrderCardProps {
  order: OdooSaleOrder;
  isHighlighted: boolean;
  isWide: boolean;
  isDense?: boolean;
  isMobile?: boolean;
  screenTier?: ScreenTier;
  viewMode: ViewMode;
  onClick?: () => void;
}

/**
 * Un solo badge de urgencia por tarjeta.
 *
 * Antes se pintaban dos: "Crítica" (prioridad) y "Vencida" (atraso). Son el mismo
 * hecho — `getOrderPriority` devuelve 'critical' exactamente cuando `diffMs < 0`,
 * que es la definición de `isOrderOverdue` — así que siempre aparecían juntas, en
 * dos colores distintos. Se colapsan en una.
 */
function getUrgencyBadge(isOverdue: boolean, priority: string) {
  if (isOverdue) return { label: 'Vencida', variant: 'dangerSolid' as const, pulse: true };
  if (priority === 'high') return { label: 'Alta', variant: 'warning' as const, pulse: false };
  return null;
}

// Remisiones (stock.picking). Se excluye 'cancel' — una remisión cancelada no
// dice nada del avance real del pedido.
const DELIVERY_STATE_LABEL: Record<string, string> = {
  done: 'Entregada',
  assigned: 'Lista',
  waiting: 'En espera',
  confirmed: 'Confirmada',
  draft: 'Borrador',
};

const DELIVERY_STATE_COLOR: Record<string, string> = {
  done: 'text-emerald-400 border-emerald-800/60',
  assigned: 'text-cyan-400 border-cyan-800/60',
  waiting: 'text-amber-400 border-amber-800/60',
  confirmed: 'text-amber-400 border-amber-800/60',
  draft: 'text-zinc-500 border-zinc-700/60',
};

const DELIVERY_STATE_ORDER = ['done', 'assigned', 'waiting', 'confirmed', 'draft'];

const OdooOrderCard: React.FC<OdooOrderCardProps> = ({
  order,
  isHighlighted,
  isWide,
  isDense = false,
  isMobile = false,
  screenTier,
  viewMode,
  onClick,
}) => {
  const priority = getOrderPriority(order);
  const progress = getDeliveryProgress(order);
  const isOverdue = isOrderOverdue(order);
  const isCritical = priority === 'critical';
  const presentation = getCardPresentation({ progress, isHighlighted, isOverdue, isCritical });
  const urgencyBadge = getUrgencyBadge(isOverdue, priority);
  const isLarge = isLargeTVCard(viewMode, isWide, screenTier);
  const { deliveryCounts, deliveryStates } = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of order.deliveries ?? []) {
      if (d.state !== 'cancel') counts[d.state] = (counts[d.state] ?? 0) + 1;
    }
    return {
      deliveryCounts: counts,
      deliveryStates: DELIVERY_STATE_ORDER.filter(state => (counts[state] ?? 0) > 0),
    };
  }, [order.deliveries]);
  const statusLabel = progress >= 100 ? 'Entregada' : progress > 0 ? 'En proceso' : 'Pendiente';
  const StatusIcon = progress >= 100
    ? CheckCircle2
    : progress > 0
      ? PlayCircle
      : Clock;
  const cardSize = isMobile
    ? 'min-h-[88px] p-3 pl-5'
    : isDense
      ? 'min-h-0 p-3 lg:p-4'
      : isLarge
        ? 'p-7 xl:p-8'
        : 'p-4 lg:p-5';
  const headingSize = isMobile
    ? 'text-base'
    : isDense
      ? 'text-sm lg:text-base'
      : isLarge
        ? 'text-3xl xl:text-4xl'
        : 'text-xl lg:text-2xl';
  const percentageSize = isMobile
    ? 'text-lg'
    : isDense
      ? 'text-base'
      : isLarge
        ? 'text-4xl xl:text-5xl'
        : 'text-2xl lg:text-3xl';
  // Cuántas líneas caben sin desbordar: escritorio las lista todas; en TV
  // depende de si la tarjeta es grande o va apretada en una página compartida.
  const maxVisibleLines = viewMode === 'desktop'
    ? order.lines.length
    : isMobile
      ? 1
      : isDense
        ? 3
        : isLarge
          ? 6
          : 4;
  const visibleLines = order.lines.slice(0, maxVisibleLines);
  const hiddenLineCount = Math.max(0, order.lines.length - visibleLines.length);
  const cardLabel = `${order.name}, ${order.partner_name}, ${progress}% ${statusLabel}${isOverdue ? ', vencida' : ''}`;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: isHighlighted ? 1.02 : 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.25 }}
      id={`so-${order.name.replace(/\//g, '-')}`}
      onClick={onClick}
      aria-label={cardLabel}
      className={`group flex w-full flex-col rounded-2xl border text-left relative overflow-hidden h-full ${cardSize} ${presentation.borderClass} ${onClick ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${presentation.accentClass}`} aria-hidden="true" />
      <span className={`absolute -top-12 -right-12 h-40 w-40 rounded-full blur-[70px] opacity-10 pointer-events-none ${presentation.glowClass}`} aria-hidden="true" />

      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={`${headingSize} truncate font-mono-data font-black tracking-tight text-white`}>
            {order.name}
          </h3>
          <SmartText
            text={order.partner_name}
            maxLines={1}
            className={`${isLarge ? 'text-base' : 'text-xs lg:text-sm'} mt-1 font-bold uppercase tracking-[0.12em] text-zinc-300`}
            defaultLevel={2}
          />
        </div>
        {urgencyBadge && (
          <Badge
            variant={urgencyBadge.variant}
            size={isLarge ? 'lg' : isDense || isMobile ? 'sm' : 'md'}
            className={`shrink-0 ${urgencyBadge.pulse ? 'animate-pulse' : ''}`}
          >
            <AlertTriangle className={isLarge ? 'h-4 w-4' : 'h-3 w-3'} aria-hidden="true" />
            {urgencyBadge.label}
          </Badge>
        )}
      </div>

      {/* flex-1 + min-h-0: las líneas ocupan el espacio libre de la tarjeta y se
          repliegan solas en las páginas compartidas más apretadas, donde el
          porcentaje y la barra tienen prioridad sobre el nombre del producto. */}
      <div className={`relative z-10 min-w-0 flex-1 min-h-0 overflow-hidden ${isLarge ? 'mt-5' : 'mt-3'}`}>
        <div className="flex flex-col gap-1">
          {visibleLines.length === 0 && (
            <div className="flex min-w-0 items-center gap-2">
              <Package className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 text-zinc-500`} aria-hidden="true" />
              <SmartText
                text={order.main_product}
                maxLines={isMobile || isDense ? 1 : 2}
                className={`${isLarge ? 'text-lg' : 'text-sm'} font-semibold text-zinc-100`}
                defaultLevel={2}
              />
            </div>
          )}
          {visibleLines.map((line: OdooOrderLine, idx: number) => {
            const lineComplete = line.qty > 0 && line.delivered >= line.qty;
            return (
              <div key={idx} className="flex min-w-0 items-center gap-2">
                {lineComplete
                  ? <Check className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 ${presentation.statusTextClass}`} aria-hidden="true" />
                  : <Package className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 text-zinc-500`} aria-hidden="true" />}
                <SmartText
                  text={line.name}
                  maxLines={1}
                  className={`${isLarge ? 'text-lg' : 'text-sm'} font-semibold leading-tight ${lineComplete ? 'text-zinc-500 line-through' : 'text-zinc-100'}`}
                  defaultLevel={2}
                />
                <span className={`shrink-0 font-mono-data font-black ${isLarge ? 'text-sm' : 'text-xs'} ${lineComplete ? presentation.statusTextClass : 'text-zinc-300'}`}>
                  {line.delivered}/{line.qty}
                </span>
              </div>
            );
          })}
          {hiddenLineCount > 0 && (
            <span className={`pl-6 font-bold text-zinc-400 ${isLarge ? 'text-sm' : 'text-xs'}`}>
              +{hiddenLineCount} más
            </span>
          )}
        </div>
      </div>

      <div className={`relative z-10 mt-auto ${isLarge ? 'pt-7' : 'pt-4'}`}>
        <div className="mb-2 flex items-end justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <StatusIcon className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} ${presentation.statusTextClass}`} aria-hidden="true" />
            <span className={`${isLarge ? 'text-sm' : 'text-[11px]'} font-black uppercase tracking-wider ${presentation.statusTextClass}`}>{statusLabel}</span>
          </div>
          <div className="flex items-baseline gap-1.5 font-mono-data">
            <span className={`${percentageSize} font-black leading-none text-white`}>{progress}%</span>
            <span className={`${isLarge ? 'text-sm' : 'text-[11px]'} font-bold text-zinc-400`}>{order.qty_delivered}/{order.qty_total}</span>
          </div>
        </div>
        <div className={`${isLarge ? 'h-3.5' : 'h-2.5'} overflow-hidden rounded-full border border-white/10 bg-black/45`}>
          <span
            className={`block h-full rounded-full ${presentation.progressClass}`}
            style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
          />
        </div>

        {/* Remisiones — se omiten sólo en móvil, donde la tarjeta es una fila. */}
        {deliveryStates.length > 0 && !isMobile && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`shrink-0 font-bold uppercase tracking-wider text-zinc-500 ${isLarge ? 'text-xs' : 'text-[11px]'}`}>
              Rem.
            </span>
            {deliveryStates.map(state => (
              <span
                key={state}
                className={`rounded border px-1.5 py-0.5 font-black ${isLarge ? 'text-xs' : 'text-[11px]'} ${DELIVERY_STATE_COLOR[state]}`}
              >
                {deliveryCounts[state]} {DELIVERY_STATE_LABEL[state]}{(deliveryCounts[state] ?? 0) > 1 ? 's' : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </motion.button>
  );
};

export default OdooOrderCard;
