type CardScreenTier = 'sm' | 'md' | 'lg' | 'xl';
type CardViewMode = 'tv' | 'desktop';

/**
 * El color de la tarjeta indica URGENCIA (días de atraso o de margen), no avance:
 * casi todas las órdenes por facturar están en 0 % de entrega, así que un color
 * por avance pintaba toda la pared igual. El avance se lee en el % y en la barra.
 */
export type UrgencyTone = 'severe' | 'late' | 'recent' | 'onTime' | 'none' | 'delivered';

export interface CardPresentation {
  accentClass: string;
  borderClass: string;
  progressClass: string;
  statusTextClass: string;
  tone: UrgencyTone;
  /** "Atraso 12 d", "Vence en 3 d", "Sin fecha"… */
  timingLabel: string;
  /** Solo las órdenes recién atrasadas parpadean: con decenas pulsando sería ruido. */
  pulse: boolean;
}

const DAY_MS = 86_400_000;
/** Hasta cuántos días de atraso una orden cuenta como "recién atrasada". */
const RECENT_LATE_DAYS = 7;
const LATE_DAYS = 30;

const VISUAL: Record<UrgencyTone, Pick<CardPresentation, 'accentClass' | 'borderClass' | 'progressClass' | 'statusTextClass'>> = {
  severe: {
    accentClass: 'bg-red-500',
    borderClass: 'bg-card border-red-500/40 hover:border-red-400/60',
    progressClass: 'bg-red-500',
    statusTextClass: 'text-red-400',
  },
  late: {
    accentClass: 'bg-orange-500',
    borderClass: 'bg-card border-orange-500/35 hover:border-orange-400/55',
    progressClass: 'bg-orange-500',
    statusTextClass: 'text-orange-400',
  },
  recent: {
    accentClass: 'bg-amber-400',
    borderClass: 'bg-card border-amber-400/35 hover:border-amber-300/55',
    progressClass: 'bg-amber-400',
    statusTextClass: 'text-amber-300',
  },
  onTime: {
    accentClass: 'bg-cyan-500/80',
    borderClass: 'bg-card border-border hover:border-cyan-400/30',
    progressClass: 'bg-cyan-400',
    statusTextClass: 'text-cyan-400',
  },
  none: {
    accentClass: 'bg-zinc-500/60',
    borderClass: 'bg-card border-border hover:border-zinc-400/30',
    progressClass: 'bg-zinc-400',
    statusTextClass: 'text-zinc-400',
  },
  delivered: {
    accentClass: 'bg-fuchsia-400',
    borderClass: 'bg-card border-fuchsia-400/30 hover:border-fuchsia-300/50',
    progressClass: 'bg-fuchsia-400',
    statusTextClass: 'text-fuchsia-400',
  },
};

export function getCardPresentation(input: {
  progress: number;
  commitmentDate: Date | null;
  now?: Date;
}): CardPresentation {
  const now = (input.now ?? new Date()).getTime();

  let tone: UrgencyTone;
  let timingLabel: string;
  let pulse = false;

  if (input.progress >= 100) {
    tone = 'delivered';
    timingLabel = 'Entregada';
  } else if (!input.commitmentDate) {
    tone = 'none';
    timingLabel = 'Sin fecha';
  } else {
    const diffDays = (input.commitmentDate.getTime() - now) / DAY_MS;
    if (diffDays < 0) {
      const daysLate = Math.floor(-diffDays);
      tone = daysLate > LATE_DAYS ? 'severe' : daysLate > RECENT_LATE_DAYS ? 'late' : 'recent';
      timingLabel = daysLate === 0 ? 'Venció hoy' : `Atraso ${daysLate} d`;
      pulse = tone === 'recent';
    } else {
      tone = 'onTime';
      timingLabel = diffDays < 1 ? 'Vence hoy' : `Vence en ${Math.ceil(diffDays)} d`;
    }
  }

  return { ...VISUAL[tone], tone, timingLabel, pulse };
}

export function isLargeTVCard(
  viewMode: CardViewMode,
  isWide: boolean,
  screenTier?: CardScreenTier,
  isDense?: boolean,
): boolean {
  if (isDense) return false;
  return viewMode === 'tv' && (isWide || screenTier === 'xl');
}
