/**
 * Cálculo puro de coordenadas para posicionar un menú contextual sin que se
 * recorte contra los bordes del viewport.
 */

export interface ContextMenuPositionInput {
  x: number;
  y: number;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  margin?: number;
}

function resolveAxis(pos: number, size: number, viewport: number, margin: number): number {
  const max = Math.max(margin, viewport - size - margin);
  let candidate = pos;
  if (pos + size + margin > viewport && pos - size >= margin) {
    candidate = pos - size;
  }
  return Math.round(Math.min(Math.max(candidate, margin), max));
}

export function computeContextMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
}: ContextMenuPositionInput): { left: number; top: number } {
  return {
    left: resolveAxis(x, menuWidth, viewportWidth, margin),
    top: resolveAxis(y, menuHeight, viewportHeight, margin),
  };
}
