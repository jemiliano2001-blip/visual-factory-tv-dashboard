/**
 * Devuelve la línea de inicio de la última fila parcial para centrarla en una
 * cuadrícula de doble precisión. Cada tarjeta ocupa dos columnas, de modo que
 * también se pueden centrar cantidades impares sin alterar su tamaño.
 */
export function getCenteredLastRowStart(
  index: number,
  orderCount: number,
  gridColumns: number,
): number | undefined {
  const columns = Math.max(1, Math.floor(gridColumns));
  const count = Math.max(0, Math.floor(orderCount));
  const remainder = count % columns;

  if (remainder === 0 || index !== count - remainder) return undefined;

  return columns - remainder + 1;
}
