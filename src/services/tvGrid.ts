import type { ScreenTier } from '../components/OdooOrderCard';

/** Tamaño del área de la rejilla (ya sin encabezado ni pie de la página). */
export interface TVGridInput { width: number; height: number; isTVMode: boolean }
export interface TVGrid { cols: number; rows: number; ordersPerPage: number; isWide: boolean; screenTier: ScreenTier }

/**
 * Piso de legibilidad de una tarjeta en modo TV (px CSS). Primero se garantiza que
 * la tarjeta se lea a 3-4 m; con eso se mete el máximo de tarjetas, y lo que no cabe
 * rota en más pantallas. La letra la ajusta cada tarjeta con `getCardFit()`.
 */
export const MIN_TV_CARD_WIDTH = 340;
/**
 * = escalón `md` de `CARD_FIT_METRICS` (chrome 138 + PO 20 + una partida 27): SO de
 * 24 px como mínimo en la tele (decisión 2026-10-23: 1920×1080 → 5×4 = 20 tarjetas).
 */
export const MIN_TV_CARD_HEIGHT = 185;
export const MAX_TV_COLS = 6;

export function computeTVGrid({ width, height, isTVMode }: TVGridInput): TVGrid {
  const aspectRatio = width / height;
  const isWideScreen = aspectRatio > 1.3;
  const gap = width > 1200 ? 16 : 12;

  let cols: number;
  let rows: number;
  if (isTVMode) {
    cols = Math.min(MAX_TV_COLS, Math.max(1, Math.floor((width + gap) / (MIN_TV_CARD_WIDTH + gap))));
    rows = Math.max(1, Math.floor((height + gap) / (MIN_TV_CARD_HEIGHT + gap)));
  } else {
    cols = width > 1800 ? 5 : width > 1400 ? 4 : width > 1000 ? 3 : width > 600 ? 2 : 1;
    rows = Math.max(4, Math.floor((height + gap) / (MIN_TV_CARD_HEIGHT + gap)));
  }

  // Breakpoints: mobile (<768) / tablet (768-1279) / desktop (1280-1919) / TV (>=1920).
  const screenTier: ScreenTier =
    width >= 1920 ? 'xl'
    : width >= 1280 ? 'lg'
    : width >= 768 ? 'md'
    : 'sm';

  return {
    cols,
    rows,
    ordersPerPage: isTVMode ? cols * rows : 999,
    isWide: cols <= 4 && rows <= 2 && isWideScreen,
    screenTier,
  };
}
