export interface RotationContext {
  isTVMode: boolean;
  pageCount: number;
  highlightedOrder: boolean;
  paused: boolean;
}

/** La pausa es una intervencion operativa, no una preferencia persistente. */
export const INITIAL_ROTATION_PAUSED = false;

export function shouldAutoRotate({
  isTVMode,
  pageCount,
  highlightedOrder,
  paused,
}: RotationContext): boolean {
  return isTVMode && pageCount > 1 && !highlightedOrder && !paused;
}
