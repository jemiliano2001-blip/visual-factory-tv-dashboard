import React from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Clock, Package, PlayCircle } from 'lucide-react';
import { OdooSaleOrder, getDeliveryProgress, getOrderPriority, isOrderOverdue } from '../services/odoo';
import { getCardPresentation, isLargeTVCard } from '../services/cardPresentation';
import SmartText from './SmartText';

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

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-zinc-800/80 text-zinc-300 border-zinc-600',
  normal: 'bg-blue-600/20 text-blue-300 border-blue-400',
  high: 'bg-orange-500/20 text-orange-300 border-orange-400',
  critical: 'bg-red-600 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica',
};

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
  const isLarge = isLargeTVCard(viewMode, isWide, screenTier);
  const primaryLine = order.lines[0];
  const extraLineCount = Math.max(0, order.lines.length - 1);
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
      className={`group flex w-full flex-col rounded-2xl border text-left relative overflow-hidden h-full ${cardSize} ${presentation.borderClass} ${presentation.urgencyClass} ${onClick ? 'cursor-pointer active:scale-[0.98]' : 'cursor-default'} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1.5 ${presentation.accentClass}`} aria-hidden="true" />
      <span className={`absolute -top-12 -right-12 h-40 w-40 rounded-full blur-[70px] opacity-10 pointer-events-none ${presentation.glowClass}`} aria-hidden="true" />

      {isOverdue && (
        <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-orange-300/50 bg-orange-500/20 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-orange-200">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          Vencida
        </span>
      )}

      <div className={`relative z-10 flex items-start justify-between gap-3 ${isOverdue ? 'pr-20' : ''}`}>
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
        {(isCritical || priority === 'high') && (
          <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${PRIORITY_COLORS[priority]}`}>
            {PRIORITY_LABELS[priority]}
          </span>
        )}
      </div>

      <div className={`relative z-10 flex min-w-0 items-center gap-2 ${isLarge ? 'mt-5' : 'mt-3'}`}>
        <Package className={`${isLarge ? 'h-5 w-5' : 'h-4 w-4'} shrink-0 text-zinc-500`} aria-hidden="true" />
        <SmartText
          text={primaryLine?.name || order.main_product}
          maxLines={isMobile || isDense ? 1 : 2}
          className={`${isLarge ? 'text-lg' : 'text-sm'} font-semibold text-zinc-100`}
          defaultLevel={2}
        />
        {extraLineCount > 0 && <span className="shrink-0 text-xs font-bold text-zinc-500">+{extraLineCount}</span>}
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
      </div>
    </motion.button>
  );
};

export default OdooOrderCard;
