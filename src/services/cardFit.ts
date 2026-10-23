/**
 * Ajuste de la tarjeta TV a su tamaño real (px CSS medidos con ResizeObserver).
 *
 * Regla "letra primero" (decisión 2026-10-23): se elige el escalón de letra más
 * grande en el que caben el SO, el PO, el pie (% + barra) y una partida; el
 * espacio que sobre se reparte en descripción más completa (2-3 renglones), luego
 * en la fecha compromiso y luego en las remisiones. Solo se cuentan renglones
 * completos, así que nunca se pinta una partida cortada a la mitad.
 */
export type CardFitTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface CardFitInput {
  width: number;
  height: number;
  lineCount: number;
  hasReference: boolean;
  showPartner: boolean;
  /** Largo (caracteres) de la partida más larga, incluida su cantidad; si falta, se asume que llena los renglones. */
  longestLineChars?: number;
}

export interface CardFit {
  tier: CardFitTier;
  /** Partidas a pintar; si hay más, la tarjeta añade "+N más". */
  maxVisibleLines: number;
  /** Renglones por descripción de partida. */
  lineClamp: 1 | 2 | 3;
  showCommitment: boolean;
  showDeliveries: boolean;
  /** Sin renglón libre para "+N más": el "+N" va pegado a la cantidad de la única partida. */
  moreInline: boolean;
}

/**
 * `chrome` = padding + SO + pie (estado, % y barra). `metaRow` = renglón de PO o
 * cliente. `lineRow` = altura de un renglón de partida (`leading-tight` + separación).
 * Si se cambian las clases de `CARD_FIT_CLASSES`, recalibrar estos números.
 */
export const CARD_FIT_METRICS: Record<CardFitTier, { minWidth: number; chrome: number; metaRow: number; lineRow: number; linePx: number; padX: number }> = {
  xs: { minWidth: 0, chrome: 82, metaRow: 14, lineRow: 18, linePx: 12, padX: 10 },
  sm: { minWidth: 200, chrome: 116, metaRow: 16, lineRow: 22, linePx: 14, padX: 12 },
  md: { minWidth: 300, chrome: 138, metaRow: 20, lineRow: 27, linePx: 18, padX: 16 },
  lg: { minWidth: 420, chrome: 176, metaRow: 22, lineRow: 32, linePx: 22, padX: 20 },
  xl: { minWidth: 540, chrome: 200, metaRow: 24, lineRow: 37, linePx: 26, padX: 24 },
};

/** Ancho promedio de un carácter respecto al tamaño de letra (Inter semibold / mono). */
const CHAR_WIDTH_RATIO = 0.55;

export const CARD_FIT_CLASSES: Record<CardFitTier, {
  pad: string; heading: string; meta: string; line: string; qty: string; pct: string; small: string; icon: string; bar: string;
}> = {
  xs: { pad: 'p-2.5', heading: 'text-sm', meta: 'text-[11px]', line: 'text-xs', qty: 'text-[11px]', pct: 'text-base', small: 'text-[10px]', icon: 'h-3.5 w-3.5', bar: 'h-1.5' },
  sm: { pad: 'p-3', heading: 'text-lg', meta: 'text-xs', line: 'text-sm', qty: 'text-xs', pct: 'text-[22px]', small: 'text-[11px]', icon: 'h-4 w-4', bar: 'h-2' },
  md: { pad: 'p-4', heading: 'text-2xl', meta: 'text-sm', line: 'text-lg', qty: 'text-base', pct: 'text-[30px]', small: 'text-xs', icon: 'h-5 w-5', bar: 'h-2.5' },
  lg: { pad: 'p-5', heading: 'text-3xl', meta: 'text-base', line: 'text-[22px]', qty: 'text-lg', pct: 'text-[38px]', small: 'text-sm', icon: 'h-6 w-6', bar: 'h-3' },
  xl: { pad: 'p-6', heading: 'text-4xl', meta: 'text-lg', line: 'text-[26px]', qty: 'text-xl', pct: 'text-[46px]', small: 'text-base', icon: 'h-7 w-7', bar: 'h-3.5' },
};

const TIERS_DESC: CardFitTier[] = ['xl', 'lg', 'md', 'sm', 'xs'];

export function getCardFit({ width, height, lineCount, hasReference, showPartner, longestLineChars }: CardFitInput): CardFit {
  if (width <= 0 || height <= 0) {
    return { tier: 'sm', maxVisibleLines: Math.min(lineCount, 2) || 1, lineClamp: 1, showCommitment: false, showDeliveries: false, moreInline: false };
  }

  const rows = Math.max(lineCount, 1);
  const fixedFor = (tier: CardFitTier, metaRows: number) => CARD_FIT_METRICS[tier].chrome + CARD_FIT_METRICS[tier].metaRow * metaRows;

  // El escalón depende solo del tamaño de la tarjeta (siempre cuenta el renglón de
  // PO y uno de partida): tarjetas iguales en la misma página llevan la misma letra,
  // sin importar cuántas partidas o si traen PO. Las partidas extra van en "+N".
  const tierMetaRows = 1 + Number(showPartner);
  const tier = TIERS_DESC.find(t =>
    width >= CARD_FIT_METRICS[t].minWidth && fixedFor(t, tierMetaRows) + CARD_FIT_METRICS[t].lineRow <= height,
  ) ?? 'xs';

  const m = CARD_FIT_METRICS[tier];
  const budget = Math.max(1, Math.floor((height - fixedFor(tier, Number(hasReference) + Number(showPartner))) / m.lineRow));

  if (lineCount > budget) {
    return { tier, maxVisibleLines: Math.max(1, budget - 1), lineClamp: 1, showCommitment: false, showDeliveries: false, moreInline: budget === 1 };
  }

  // Renglones que de verdad ocupa la descripción más larga (ancho útil = tarjeta
  // menos padding, borde e ícono); así no se reservan renglones que quedarían vacíos.
  const textWidth = Math.max(1, width - 2 * m.padX - 2 - (m.linePx + 8));
  const textRows = longestLineChars === undefined
    ? 3
    : Math.max(1, Math.ceil((longestLineChars * CHAR_WIDTH_RATIO * m.linePx) / textWidth));
  const lineClamp = Math.min(3, textRows, 1 + Math.floor((budget - rows) / rows)) as 1 | 2 | 3;
  const free = budget - rows * lineClamp;
  return { tier, maxVisibleLines: lineCount, lineClamp, showCommitment: free >= 1, showDeliveries: free >= 2, moreInline: false };
}
