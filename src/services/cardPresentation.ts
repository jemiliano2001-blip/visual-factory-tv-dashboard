type CardScreenTier = 'sm' | 'md' | 'lg' | 'xl';
type CardViewMode = 'tv' | 'desktop';

export type ProgressTone = 'pending' | 'inProgress' | 'delivered';

export interface CardPresentation {
  accentClass: string;
  borderClass: string;
  glowClass: string;
  progressClass: string;
  statusTextClass: string;
  tone: ProgressTone;
  urgencyClass: string;
}

export function getCardPresentation(input: {
  progress: number;
  isHighlighted: boolean;
  isOverdue: boolean;
  isCritical: boolean;
}): CardPresentation {
  const tone: ProgressTone = input.progress >= 100
    ? 'delivered'
    : input.progress > 0
      ? 'inProgress'
      : 'pending';

  const progressVisual = tone === 'delivered'
    ? {
        accentClass: 'bg-fuchsia-400',
        borderClass: 'bg-card/70 border-fuchsia-400/30 hover:border-fuchsia-300/50',
        glowClass: 'bg-fuchsia-500',
        progressClass: 'bg-fuchsia-400',
        statusTextClass: 'text-fuchsia-400',
      }
    : tone === 'inProgress'
      ? {
          accentClass: 'bg-emerald-400',
          borderClass: 'bg-card/70 border-emerald-400/30 hover:border-emerald-300/50',
          glowClass: 'bg-emerald-500',
          progressClass: 'bg-emerald-400',
          statusTextClass: 'text-emerald-400',
        }
      : {
          accentClass: 'bg-cyan-500/80',
          borderClass: 'bg-card/70 border-border hover:border-cyan-400/30',
          glowClass: 'bg-cyan-500',
          progressClass: 'bg-cyan-400',
          statusTextClass: 'text-cyan-400',
        };

  return {
    ...progressVisual,
    tone,
    // La urgencia se agrega como anillo: nunca sustituye el color de avance.
    urgencyClass: input.isCritical
      ? 'ring-2 ring-red-500/70 shadow-[0_0_22px_rgba(220,38,38,0.34)]'
      : input.isOverdue
        ? 'ring-1 ring-orange-500/55 shadow-[0_0_18px_rgba(249,115,22,0.25)]'
        : '',
    ...(input.isHighlighted ? {
      borderClass: 'bg-primary/10 border-primary/60 shadow-[0_0_45px_rgba(99,102,241,0.35)] z-50',
      accentClass: progressVisual.accentClass,
    } : {}),
  };
}

export function isLargeTVCard(viewMode: CardViewMode, isWide: boolean, screenTier?: CardScreenTier): boolean {
  return viewMode === 'tv' && (isWide || screenTier === 'xl');
}
