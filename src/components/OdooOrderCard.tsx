import React from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle, Clock, Timer, HelpCircle, CheckCircle2,
  Package, User, Calendar, FileText, Check,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  OdooSaleOrder, OdooOrderLine, getOrderPriority, getDeliveryProgress,
  parseOdooDate, getOrderAgeDays, formatOrderAge, STALE_AGE_DAYS,
  getDeliveryTimeStatus, getOrderStatus, OrderStatusLevel,
} from '../services/odoo';
import SmartText from './SmartText';

// ─── Tipos ──────────────────────────────────────────────────────────────────────

export type ViewMode = 'tv' | 'desktop';

/**
 * Nivel de legibilidad según el ancho real del viewport, calculado en
 * TVDashboard y propagado a las tarjetas. Permite escalar la tipografía de
 * forma inteligente: tablet < desktop < TV/4K. No reemplaza a isWide/isDense
 * (que deciden el *layout* estructural), sino que afina el *tamaño* del texto.
 */
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

// Prioridad (campo derivado de la fecha compromiso). Estilo PLANO, sin glow, y
// con la misma paleta del sistema de estado para coherencia visual.
const PRIORITY_COLORS: Record<string, string> = {
  low:      'bg-zinc-800 text-zinc-300 border-zinc-700',
  normal:   'bg-zinc-800 text-zinc-100 border-zinc-600',
  high:     'bg-status-warning/15 text-status-warning border-status-warning/45',
  critical: 'bg-status-overdue/20 text-status-overdue border-status-overdue/55',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Vencida',
};

/**
 * Sistema de color ÚNICO del Dashboard: el color = urgencia. Cada nivel define
 * la banda lateral, el texto de estado, la barra de progreso, la pastilla y el
 * tinte del borde/fondo de la tarjeta. Colores sólidos y vivos, sin glow ni blur.
 */
interface StatusStyle {
  band: string;    // fondo de la banda lateral de color sólido
  text: string;    // color de texto del estado
  bar: string;     // relleno de la barra de progreso
  border: string;  // borde de la tarjeta (tinte de estado)
  bg: string;      // fondo de la tarjeta (tinte sutil)
}

// Jerarquía de alarma (DESIGN.md): "Atrasada" es lo ÚNICO ruidoso de la pared
// (rojo saturado, borde reforzado). "En tiempo" se atenúa a cromática neutra con
// solo una pequeña banda tenue como indicador, para que ceda a la distancia.
const STATUS_STYLES: Record<OrderStatusLevel, StatusStyle> = {
  'overdue':  { band: 'bg-status-overdue', text: 'text-status-overdue',   bar: 'bg-status-overdue', border: 'border-status-overdue/70', bg: 'bg-status-overdue/[0.08]' },
  'warning':  { band: 'bg-status-warning', text: 'text-status-warning',   bar: 'bg-status-warning', border: 'border-status-warning/45', bg: 'bg-status-warning/[0.04]' },
  'on-time':  { band: 'bg-status-ontime',  text: 'text-muted-foreground', bar: 'bg-status-ontime',  border: 'border-border',           bg: 'bg-card' },
  'none':     { band: 'bg-status-none',    text: 'text-status-none',      bar: 'bg-status-none',    border: 'border-status-none/35',    bg: 'bg-card' },
};

const statusIconFor = (level: OrderStatusLevel, cls: string): React.ReactNode => {
  switch (level) {
    case 'overdue': return <AlertTriangle className={cls} />;
    case 'warning': return <Timer className={cls} />;
    case 'on-time': return <CheckCircle2 className={cls} />;
    default:        return <HelpCircle className={cls} />;
  }
};

// ─── Componente ─────────────────────────────────────────────────────────────────

const OdooOrderCard: React.FC<OdooOrderCardProps> = ({
  order,
  isHighlighted,
  isWide,
  isDense,
  isMobile,
  screenTier = 'lg',
  viewMode,
  onClick,
}) => {
  // Tipografía grande: tarjetas amplias (isWide) o pantallas tipo TV/4K (xl).
  const big = isWide || screenTier === 'xl';
  const priority = React.useMemo(() => getOrderPriority(order), [order.commitment_date]);
  const progress = React.useMemo(() => getDeliveryProgress(order), [order.qty_delivered, order.qty_total]);
  const commitmentDate = React.useMemo(() => parseOdooDate(order.commitment_date), [order.commitment_date]);
  const isDesktop = viewMode === 'desktop';
  const ageDays = React.useMemo(() => getOrderAgeDays(order), [order.date_order]);
  const isStale = ageDays !== null && ageDays > STALE_AGE_DAYS;
  const deliveryTime = React.useMemo(() => getDeliveryTimeStatus(order), [order.note, order.date_order]);

  // ── Estado de urgencia: la ÚNICA fuente del color de la tarjeta ─────────────
  const status = React.useMemo(() => getOrderStatus(order), [order.commitment_date, order.note, order.date_order]);
  const st = STATUS_STYLES[status.level];

  // ── Resumen de remisiones (excluye canceladas) ─────────────────────────────
  const { deliveryCounts, deliveryStates } = React.useMemo(() => {
    const counts: Record<string, number> = {};
    const deliveries = order.deliveries ?? [];
    for (const d of deliveries) {
      if (d.state !== 'cancel') {
        counts[d.state] = (counts[d.state] ?? 0) + 1;
      }
    }
    const states = ['done', 'assigned', 'waiting', 'confirmed', 'draft'].filter(
      s => (counts[s] ?? 0) > 0,
    );
    return { deliveryCounts: counts, deliveryStates: states };
  }, [order.deliveries]);

  // ── Marco de la tarjeta ─────────────────────────────────────────────────────
  // El realce por voz (isHighlighted) es el ÚNICO lugar donde usamos un glow
  // sutil; el resto del Dashboard es plano para máxima legibilidad.
  const cardFrame = isHighlighted
    ? 'bg-primary/10 border-primary/70 ring-2 ring-primary/40 shadow-[0_0_40px_rgba(99,102,241,0.4)] z-50 scale-[1.03]'
    : `${st.bg} ${st.border}`;

  // Distintivo de antigüedad (>1 mes): ring ámbar ADITIVO, sin tapar el color de
  // estado. Se omite si la card ya tiene su propio realce (resaltada).
  const staleRing = isStale && !isHighlighted ? 'ring-1 ring-amber-500/40' : '';

  // Badge de tiempo de entrega (días hábiles), coloreado por el estado de urgencia.
  const deliveryBadge = deliveryTime.status !== 'unknown' ? (
    <span className={`font-black px-2 py-0.5 rounded flex items-center gap-1 border border-white/10 bg-black/30 ${st.text}`}>
      <Timer className={big ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {deliveryTime.businessDaysRemaining !== null
        ? `${deliveryTime.businessDaysRemaining}d háb`
        : `${deliveryTime.daysRange?.min}-${deliveryTime.daysRange?.max}d`}
    </span>
  ) : null;

  // ── Mobile layout (lista súper compacta para móviles) ──────────────────────
  if (isMobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        id={`so-${order.name.replace(/\//g, '-')}`}
        onClick={onClick}
        className={`flex flex-col rounded-xl border transition-all duration-300 relative overflow-hidden ${cardFrame} ${staleRing} pl-4 pr-3.5 py-3 gap-2 min-h-[72px] cursor-pointer active:scale-[0.98]`}
      >
        {/* Banda de estado */}
        <div className={`absolute left-0 top-0 bottom-0 w-2 ${st.band}`} />

        {/* Fila 1: Título, Prioridad y Edad */}
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
            {isStale && (
              <span className="text-[11px] font-black px-2 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40">
                {formatOrderAge(ageDays!)}
              </span>
            )}
          </div>
        </div>

        {/* Fila 2: Producto principal y badge de tiempo */}
        <div className="flex items-start justify-between gap-2 z-10 mt-0.5">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
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
          {deliveryTime.status !== 'unknown' && (
            <span className={`text-[11px] shrink-0 ${st.text}`}>{deliveryBadge}</span>
          )}
        </div>

        {/* Fila 3: Estado, barra y piezas entregadas */}
        <div className="mt-1 relative z-10 flex items-center gap-2">
          <div className="flex items-center gap-1 shrink-0">
            {statusIconFor(status.level, `w-4 h-4 ${st.text}`)}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${st.text}`}>
              {status.label}
            </span>
          </div>
          <div className="flex-1 bg-black/40 h-1.5 rounded-full overflow-hidden border border-white/5 mx-1">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${st.bar}`}
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
        className={`flex items-center rounded-2xl border transition-all duration-300 relative overflow-hidden h-full ${cardFrame} ${staleRing} pl-5 pr-3 lg:pr-4 py-3 lg:py-4 gap-3 lg:gap-4 min-h-0 ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : ''}`}
      >
        {/* Banda de estado */}
        <div className={`absolute left-0 top-0 bottom-0 w-2.5 ${st.band}`} />

        <div className="flex-shrink-0 relative z-10">
          {statusIconFor(status.level, `w-5 h-5 ${st.text}`)}
        </div>

        <div className="flex flex-col flex-1 min-w-0 relative z-10 justify-center overflow-hidden">
          <div className="flex justify-between items-center mb-1">
            <h3 className={`${big ? 'text-lg lg:text-xl' : 'text-base lg:text-lg'} font-black tracking-tight text-white truncate pr-2 font-mono-data`}>
              {order.name}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0">
              {isStale && (
                <span className="text-[10px] lg:text-[11px] font-black px-1.5 py-0.5 rounded border bg-amber-500/15 text-amber-400 border-amber-500/40" title={`Creada hace ${formatOrderAge(ageDays!)}`}>
                  {formatOrderAge(ageDays!)}
                </span>
              )}
              <span className={`text-[10px] lg:text-xs font-black uppercase tracking-wider px-1.5 py-0.5 rounded border ${PRIORITY_COLORS[priority]}`}>
                {PRIORITY_LABELS[priority]}
              </span>
            </div>
          </div>

          <div className="text-xs lg:text-sm font-semibold text-zinc-200 mb-1.5 min-h-0 overflow-hidden flex items-center gap-1.5">
            <SmartText
              text={order.lines[0]?.name || order.main_product}
              maxLines={1}
              defaultLevel={2}
            />
            {order.lines.length > 1 && (
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-300 border border-zinc-600/50 flex-shrink-0">
                +{order.lines.length - 1}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={`text-[10px] lg:text-xs font-bold uppercase tracking-wider ${st.text}`}>
              {status.label}
            </span>
            {deliveryTime.status !== 'unknown' && (
              <span className="text-[10px] lg:text-xs">{deliveryBadge}</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 bg-black/40 h-2 lg:h-2.5 rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${st.bar}`}
                style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
              />
            </div>
            <div className="flex flex-col items-end min-w-[52px]">
              <span className={`${big ? 'text-lg lg:text-xl' : 'text-base lg:text-lg'} font-black text-white leading-none mb-0.5 font-mono-data`}>
                {progress}%
              </span>
              <span className="text-xs lg:text-sm text-zinc-400 font-bold leading-none font-mono-data">
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
      className={`flex flex-col rounded-2xl border transition-all duration-500 relative overflow-hidden h-full min-h-0 ${cardFrame} ${staleRing} ${isWide ? 'pl-7 pr-5 py-5 xl:py-7' : 'pl-5 pr-3.5 py-3.5 lg:py-4'} ${onClick ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]' : ''}`}
    >
      {/* Banda de estado sólida (color = urgencia) */}
      <div className={`absolute left-0 top-0 bottom-0 ${big ? 'w-3' : 'w-2.5'} ${st.band}`} />

      {/* Header: SO number + priority */}
      <div className="flex justify-between items-start mb-2.5 lg:mb-3 relative z-10 min-h-0">
        <div className="flex-1 min-w-0">
          <h3 className={`${big ? 'text-3xl 2xl:text-4xl' : 'text-xl lg:text-2xl'} font-bold tracking-tight text-white mb-1 truncate font-mono-data`}>
            {order.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 min-w-0">
              <User className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-zinc-500 flex-shrink-0`} />
              <SmartText
                text={order.partner_name}
                maxLines={1}
                className={`${big ? 'text-base' : 'text-sm'} font-bold text-zinc-300 uppercase tracking-[0.15em]`}
                defaultLevel={2}
              />
            </div>
            {commitmentDate && (
              <span className={`${big ? 'text-sm' : 'text-xs'} font-black px-2 py-0.5 rounded flex items-center gap-1 bg-zinc-800 border flex-shrink-0 ${status.level === 'overdue' ? 'text-status-overdue border-status-overdue/40' : 'text-zinc-400 border-zinc-700'}`}>
                <Calendar className={`${big ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
                {format(commitmentDate, 'dd/MM/yy')}
              </span>
            )}
            {isStale && (
              <span className={`${big ? 'text-sm' : 'text-xs'} font-black px-2 py-0.5 rounded flex items-center gap-1 bg-amber-500/15 text-amber-400 border border-amber-500/40 flex-shrink-0`} title={`Creada hace ${formatOrderAge(ageDays!)}`}>
                <Clock className={`${big ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
                {formatOrderAge(ageDays!)}
              </span>
            )}
            {deliveryTime.status !== 'unknown' && (
              <span
                className={`${big ? 'text-sm' : 'text-xs'}`}
                title={`Entrega: ${deliveryTime.daysRange?.min}-${deliveryTime.daysRange?.max} días hábiles${deliveryTime.businessDaysRemaining !== null ? ` (${deliveryTime.businessDaysRemaining >= 0 ? deliveryTime.businessDaysRemaining + ' restantes' : Math.abs(deliveryTime.businessDaysRemaining) + ' vencidos'})` : ''}`}
              >
                {deliveryBadge}
              </span>
            )}
          </div>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full ${big ? 'text-sm' : 'text-xs'} font-black uppercase tracking-wider border ml-2 flex-shrink-0 ${PRIORITY_COLORS[priority]}`}>
          {PRIORITY_LABELS[priority]}
        </span>
      </div>

      {/* Product lines — lista compacta de todas las líneas */}
      <div className="relative z-10 mb-2 lg:mb-3 min-h-0 overflow-hidden">
        <div className="flex flex-col gap-1">
          {(isDesktop ? order.lines : order.lines.slice(0, 3)).map((line: OdooOrderLine, idx: number) => {
            const lineComplete = line.qty > 0 && line.delivered >= line.qty;
            return (
              <div key={idx} className="flex items-center gap-1.5 min-w-0">
                {lineComplete
                  ? <Check className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} flex-shrink-0 ${st.text}`} />
                  : <Package className={`${big ? 'w-4 h-4' : 'w-3.5 h-3.5'} flex-shrink-0 text-zinc-500`} />
                }
                <SmartText
                  text={line.name}
                  className={`${big ? 'text-base' : 'text-sm'} font-semibold ${lineComplete ? 'text-zinc-500 line-through' : 'text-zinc-100'} leading-tight`}
                  maxLines={1}
                  defaultLevel={2}
                />
                <span className={`${big ? 'text-sm' : 'text-xs'} font-black flex-shrink-0 font-mono-data ${lineComplete ? st.text : 'text-zinc-300'}`}>
                  {line.delivered}/{line.qty}
                </span>
              </div>
            );
          })}
          {!isDesktop && order.lines.length > 3 && (
            <span className={`${big ? 'text-sm' : 'text-xs'} text-zinc-400 font-bold pl-5`}>
              +{order.lines.length - 3} más
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-auto relative z-10 min-h-0">
        <div className="flex justify-between items-end mb-2 lg:mb-2.5">
          <div className="flex items-center gap-1.5">
            {statusIconFor(status.level, `${big ? 'w-5 h-5' : 'w-4 h-4'} ${st.text}`)}
            <span className={`${big ? 'text-sm' : 'text-xs'} font-bold uppercase tracking-[0.12em] ${st.text}`}>
              {status.label}
            </span>
          </div>
          <div className="text-right flex items-baseline gap-2">
            <span className={`${big ? 'text-4xl 2xl:text-5xl' : 'text-2xl lg:text-3xl'} font-black text-white font-mono-data leading-none`}>
              {progress}%
            </span>
            {order.qty_total > 0 && (
              <span className={`${big ? 'text-lg' : 'text-base'} font-black text-zinc-300 font-mono-data leading-none`}>
                {order.qty_delivered}/{order.qty_total}
              </span>
            )}
          </div>
        </div>

        <div className={`${big ? 'h-4' : 'h-3'} bg-black/50 rounded-full overflow-hidden border border-white/5`}>
          <div
            className={`h-full rounded-full transition-all duration-1000 ${st.bar}`}
            style={{ width: `${Math.max(progress, progress > 0 ? 4 : 0)}%` }}
          />
        </div>

        {/* Lines count + salesperson */}
        <div className="flex justify-between items-center mt-2">
          <div className={`flex items-center gap-1 ${big ? 'text-xs' : 'text-[11px]'} text-zinc-500 font-bold uppercase tracking-wider`}>
            <FileText className={`${big ? 'w-3.5 h-3.5' : 'w-3 h-3'}`} />
            {order.lines_count} {order.lines_count === 1 ? 'línea' : 'líneas'}
          </div>
          {order.salesperson && (
            <div className={`${big ? 'text-xs' : 'text-[11px]'} text-zinc-500 font-bold uppercase tracking-wider truncate max-w-[140px]`}>
              {order.salesperson}
            </div>
          )}
        </div>

        {/* Remisiones */}
        {deliveryStates.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className={`${big ? 'text-xs' : 'text-[11px]'} text-zinc-500 font-bold uppercase tracking-wider shrink-0`}>
              Rem.
            </span>
            {deliveryStates.map(state => (
              <span
                key={state}
                className={`${big ? 'text-xs' : 'text-[11px]'} font-black px-1.5 py-0.5 rounded border ${DELIVERY_STATE_COLOR[state]}`}
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
