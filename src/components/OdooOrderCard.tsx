import React from 'react';
import { motion } from 'framer-motion';
import {
  Clock, AlertTriangle, CheckCircle2, PlayCircle,
  DollarSign, Package, User, Calendar, FileText,
} from 'lucide-react';
import { format } from 'date-fns';
import { OdooSaleOrder, getOrderPriority, getDeliveryProgress, isOrderOverdue, parseOdooDate } from '../services/odoo';
import SmartText from './SmartText';

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export type ViewMode = 'tv' | 'desktop';

interface OdooOrderCardProps {
  order: OdooSaleOrder;
  isHighlighted: boolean;
  isWide: boolean;
  isDense?: boolean;
  viewMode: ViewMode;
}

// ─── Constantes de estilo ───────────────────────────────────────────────────────

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
  isHighlighted,
  isWide,
  isDense,
  viewMode,
}) => {
  const priority = getOrderPriority(order);
  const progress = getDeliveryProgress(order);
  const isCritical = priority === 'critical';
  const isOverdue = isOrderOverdue(order);
  const commitmentDate = parseOdooDate(order.commitment_date);
  const isDesktop = viewMode === 'desktop';

  // ── Colores por estado ──────────────────────────────────────────────────────
  const cardBorder = isHighlighted
    ? 'bg-indigo-900/40 border-indigo-400 shadow-[0_0_100px_rgba(99,102,241,0.6)] z-50 scale-105'
    : isCritical
    ? 'bg-red-950/60 border-red-500 shadow-[0_0_30px_rgba(220,38,38,0.5)]'
    : isOverdue
    ? 'bg-orange-950/40 border-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.4)] ring-4 ring-orange-500/20'
    : progress >= 100
    ? 'bg-fuchsia-950/30 border-fuchsia-400/50 hover:border-fuchsia-300 hover:shadow-[0_0_25px_rgba(217,70,239,0.4)]'
    : progress > 0
    ? 'bg-emerald-950/30 border-emerald-400/50 hover:border-emerald-300 hover:shadow-[0_0_25px_rgba(52,211,153,0.4)]'
    : 'bg-cyan-950/30 border-cyan-400/50 hover:border-cyan-300 hover:shadow-[0_0_25px_rgba(34,211,238,0.4)]';

  const progressColor =
    progress >= 100 ? 'bg-fuchsia-400 shadow-[0_0_20px_rgba(232,121,249,0.6)]'
    : progress > 0   ? 'bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.6)]'
    : 'bg-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.6)]';

  const glowColor =
    progress >= 100 ? 'bg-fuchsia-500'
    : progress > 0   ? 'bg-emerald-500'
    : 'bg-cyan-500';

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

  // ── Dense layout (muchas cards, poco espacio) ───────────────────────────────
  if (isDense) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: isHighlighted ? 1.02 : 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.3 }}
        id={`so-${order.name.replace(/\//g, '-')}`}
        className={`flex items-center rounded-2xl border-2 transition-all duration-300 relative overflow-hidden h-full ${cardBorder} p-3 lg:p-4 gap-3 lg:gap-4 min-h-0`}
      >
        {isOverdue && (
          <div className="absolute top-0 right-0 bg-orange-500 w-2 h-full z-20" title="Vencida" />
        )}
        <div className="flex-shrink-0 relative z-10">
          {StatusIcon}
        </div>
        
        <div className="flex flex-col flex-1 min-w-0 relative z-10 justify-center overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-sm lg:text-base font-black tracking-tight text-white truncate pr-2">
              {order.name}
            </h3>
            <span className={`text-[8px] lg:text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLORS[priority]}`}>
              {PRIORITY_LABELS[priority]}
            </span>
          </div>
          
          <div className="text-[10px] lg:text-xs font-bold text-zinc-300 mb-1.5 min-h-0 overflow-hidden">
            <SmartText
              text={order.main_product}
              maxLines={1}
              disableSmart={isDesktop}
            />
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
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: isHighlighted ? 1.05 : 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.4, type: 'spring', bounce: 0.3 }}
      id={`so-${order.name.replace(/\//g, '-')}`}
      className={`flex flex-col rounded-3xl border-2 transition-all duration-500 relative overflow-hidden h-full min-h-0 ${cardBorder} ${isWide ? 'p-6 xl:p-8' : 'p-4 lg:p-5'}`}
    >
      {/* Overdue badge */}
      {isOverdue && (
        <div className="absolute top-0 right-0 bg-orange-500 text-white px-4 py-1 rounded-bl-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center gap-2 z-20 shadow-lg">
          <AlertTriangle className="w-3 h-3 animate-bounce" />
          Vencida
        </div>
      )}

      {/* Odoo badge */}
      <div className="absolute top-0 left-0 px-3 py-1 rounded-br-2xl font-black text-[9px] uppercase tracking-[0.15em] flex items-center gap-1.5 z-20 bg-violet-500/20 text-violet-300 border-b border-r border-violet-500/30">
        <DollarSign className="w-2.5 h-2.5" />
        A Facturar
      </div>

      {/* Background glow */}
      <div className={`absolute -top-16 -right-16 w-48 h-48 blur-[80px] rounded-full opacity-20 pointer-events-none ${glowColor}`} />

      {/* Header: SO number + priority */}
      <div className="flex justify-between items-start mb-3 lg:mb-4 relative z-10 mt-5 min-h-0">
        <div className="flex-1 min-w-0">
          <h3 className={`${isWide ? 'text-3xl xl:text-4xl' : 'text-xl lg:text-2xl'} font-black tracking-tighter text-white mb-1 drop-shadow-lg truncate`}>
            {order.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className="w-3 h-3 text-zinc-500 flex-shrink-0" />
              <SmartText
                text={order.partner_name}
                maxLines={1}
                className={`${isWide ? 'text-sm' : 'text-xs'} font-bold text-zinc-400 uppercase tracking-[0.15em]`}
                disableSmart={isDesktop}
              />
            </div>
            {commitmentDate && (
              <span className={`text-[10px] font-black px-2 py-0.5 rounded flex items-center gap-1 bg-zinc-800 border flex-shrink-0 ${isOverdue ? 'text-red-400 border-red-500/30' : 'text-zinc-500 border-zinc-700'}`}>
                <Calendar className="w-2.5 h-2.5" />
                {format(commitmentDate, 'dd/MM/yy')}
              </span>
            )}
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ml-2 flex-shrink-0 ${PRIORITY_COLORS[priority]}`}>
          {PRIORITY_LABELS[priority]}
        </span>
      </div>

      {/* Product name — SmartText con truncado inteligente */}
      <div
        className={`${isWide ? 'text-xl xl:text-2xl' : 'text-sm lg:text-base'} font-bold text-zinc-100 mb-2 lg:mb-3 relative z-10 leading-tight flex items-start gap-2 min-h-0 overflow-hidden`}
      >
        <Package className={`${isWide ? 'w-5 h-5' : 'w-4 h-4'} flex-shrink-0 mt-0.5 text-zinc-500`} />
        <SmartText
          text={order.main_product}
          maxLines={isWide ? 2 : 2}
          disableSmart={isDesktop}
        />
      </div>

      {/* Progress bar */}
      <div className="mt-auto relative z-10 min-h-0">
        <div className="flex justify-between items-end mb-2 lg:mb-3">
          <div className="flex items-center gap-2">
            {StatusIcon}
            <span className={`${isWide ? 'text-sm xl:text-base' : 'text-[10px] lg:text-xs'} font-black uppercase tracking-[0.15em] ${statusTextColor}`}>
              {statusLabel}
            </span>
          </div>
          <div className="text-right">
            <span className={`${isWide ? 'text-3xl xl:text-4xl' : 'text-xl lg:text-2xl'} font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]`}>
              {progress}%
            </span>
          </div>
        </div>

        {order.qty_total > 0 && (
          <div className={`flex justify-between ${isWide ? 'text-sm' : 'text-[10px]'} font-bold text-zinc-500 mb-2 uppercase tracking-widest`}>
            <span>Entregado: {order.qty_delivered}</span>
            <span>Total: {order.qty_total}</span>
          </div>
        )}

        <div className={`${isWide ? 'h-4 xl:h-5' : 'h-2.5 lg:h-3'} bg-black/40 rounded-full overflow-hidden border border-white/5 shadow-inner`}>
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
      </div>
    </motion.div>
  );
};

export default OdooOrderCard;
