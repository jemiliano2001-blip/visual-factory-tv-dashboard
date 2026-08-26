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

  // La urgencia NO pinta la superficie de la tarjeta: antes se sumaba un anillo
  // rojo con glow encima del acento de avance, y a la vista quedaban dos colores
  // peleándose por la misma tarjeta (más aún en las páginas compartidas, donde el
  // panel del cliente ya trae su propio borde). El aviso de vencida vive ahora en
  // un solo badge; el color de la tarjeta sigue siendo el del avance.
  // Nota: la rama antigua `isOverdue → anillo naranja` era inalcanzable —
  // `getOrderPriority` devuelve 'critical' exactamente cuando `isOrderOverdue` es
  // true, así que `isCritical` siempre ganaba primero.
  return {
    ...progressVisual,
    tone,
    ...(input.isHighlighted ? {
      borderClass: 'bg-primary/10 border-primary/60 shadow-[0_0_45px_rgba(99,102,241,0.35)] z-50',
      accentClass: progressVisual.accentClass,
    } : {}),
  };
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
