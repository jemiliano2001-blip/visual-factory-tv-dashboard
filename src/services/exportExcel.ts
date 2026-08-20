/**
 * Exportación a Excel de la consola admin — el entregable principal para el
 * equipo de diseño. Cuatro hojas: Resumen, Órdenes, Líneas pendientes y
 * Remisiones, con formato real (anchos, encabezado congelado, autofiltro y
 * color por estado) en vez de una hoja plana sin estilos.
 */
import * as XLSX from 'xlsx-js-style';
import { format } from 'date-fns';
import { OdooSaleOrder, getOrderStatus, OrderStatusLevel, parseOdooDate } from './odoo';
import { collectPendingLines, getOrderMissingQty } from './pendingItems';

const STATUS_LABEL: Record<OrderStatusLevel, string> = {
  overdue: 'Atrasada',
  warning: 'Por vencer',
  'on-time': 'En tiempo',
  none: 'Sin fecha',
};

// Mismos hex que --color-status-* en src/index.css (DESIGN.md).
const STATUS_FILL: Record<OrderStatusLevel, string> = {
  overdue: 'FFEF4444',
  warning: 'FFF59E0B',
  'on-time': 'FF3F6B54',
  none: 'FF64748B',
};

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFF4F4F5' } },
  fill: { fgColor: { rgb: 'FF16161D' } },
  alignment: { vertical: 'center' },
};

const STATUS_TEXT_STYLE = { font: { color: { rgb: 'FFFFFFFF' }, bold: true } };

function dateStr(value: string | null | undefined): string {
  const d = parseOdooDate(value);
  return d ? format(d, 'dd/MM/yyyy') : '';
}

function applySheetChrome(ws: XLSX.WorkSheet, colWidths: number[]) {
  ws['!cols'] = colWidths.map(w => ({ wch: w }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };

  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    if (cell) cell.s = HEADER_STYLE;
  }
}

/** Colorea de fondo las celdas de una columna "Estado" según su valor. */
function colorStatusColumn(ws: XLSX.WorkSheet, colIndex: number, rowCount: number, statuses: OrderStatusLevel[]) {
  for (let r = 0; r < rowCount; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c: colIndex })];
    if (!cell) continue;
    cell.s = { ...STATUS_TEXT_STYLE, fill: { fgColor: { rgb: STATUS_FILL[statuses[r]] } } };
  }
}

function buildSummarySheet(orders: OdooSaleOrder[]): XLSX.WorkSheet {
  const missing = orders.reduce((s, o) => s + getOrderMissingQty(o), 0);
  const overdue = orders.filter(o => getOrderStatus(o).level === 'overdue').length;

  const byClient = new Map<string, { orders: number; missing: number }>();
  for (const o of orders) {
    const entry = byClient.get(o.partner_name) ?? { orders: 0, missing: 0 };
    entry.orders += 1;
    entry.missing += getOrderMissingQty(o);
    byClient.set(o.partner_name, entry);
  }

  const rows: (string | number)[][] = [
    ['Reporte de órdenes por facturar', ''],
    ['Generado el', format(new Date(), 'dd/MM/yyyy HH:mm')],
    ['Órdenes', orders.length],
    ['Piezas pendientes', missing],
    ['Órdenes atrasadas', overdue],
    [''],
    ['Cliente', 'Órdenes', 'Piezas pendientes'],
    ...Array.from(byClient.entries())
      .sort((a, b) => b[1].missing - a[1].missing)
      .map(([client, e]) => [client, e.orders, e.missing]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 16 }, { wch: 18 }];
  const titleCell = ws['A1'];
  if (titleCell) titleCell.s = { font: { bold: true, sz: 14 } };
  const headerCell = ws['A7'];
  if (headerCell) headerCell.s = HEADER_STYLE;
  const headerCell2 = ws['B7'];
  if (headerCell2) headerCell2.s = HEADER_STYLE;
  const headerCell3 = ws['C7'];
  if (headerCell3) headerCell3.s = HEADER_STYLE;
  return ws;
}

function buildOrdersSheet(orders: OdooSaleOrder[]): XLSX.WorkSheet {
  const statuses = orders.map(o => getOrderStatus(o).level);
  const data = orders.map(o => {
    const pendingDeliveries = (o.deliveries ?? []).filter(d => d.state !== 'done' && d.state !== 'cancel').length;
    return {
      'SO': o.name,
      'Cliente': o.partner_name,
      'Producto': o.main_product,
      'Fecha Orden': dateStr(o.date_order),
      'Compromiso': dateStr(o.commitment_date),
      'Estado': STATUS_LABEL[getOrderStatus(o).level],
      'Faltan': getOrderMissingQty(o),
      'Entregado': o.qty_delivered,
      'Total': o.qty_total,
      'Remisiones pendientes': pendingDeliveries,
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  applySheetChrome(ws, [14, 26, 34, 12, 12, 12, 9, 10, 8, 18]);
  colorStatusColumn(ws, 5, data.length, statuses);
  return ws;
}

function buildPendingLinesSheet(orders: OdooSaleOrder[]): XLSX.WorkSheet {
  const pendingLines = collectPendingLines(orders);
  const statuses = pendingLines.map(pl => getOrderStatus(pl.order).level);
  const data = pendingLines.map(pl => ({
    'SO': pl.order.name,
    'Cliente': pl.order.partner_name,
    'Descripción': pl.line.name,
    'Cant.': pl.line.qty,
    'Entregado': pl.line.delivered,
    'Faltan': pl.missing,
    'Compromiso': dateStr(pl.order.commitment_date),
    'Estado': STATUS_LABEL[getOrderStatus(pl.order).level],
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  applySheetChrome(ws, [14, 26, 40, 8, 10, 8, 12, 12]);
  colorStatusColumn(ws, 7, data.length, statuses);
  return ws;
}

function buildDeliveriesSheet(orders: OdooSaleOrder[]): XLSX.WorkSheet {
  const rows = orders.flatMap(o =>
    (o.deliveries ?? [])
      .filter(d => d.state !== 'cancel')
      .map(d => ({
        'SO': o.name,
        'Cliente': o.partner_name,
        'Remisión': d.name,
        'Estado': d.state,
        'Fecha': dateStr(d.date_done),
      }))
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  applySheetChrome(ws, [14, 26, 18, 14, 12]);
  return ws;
}

interface ExportOptions {
  /** Órdenes a exportar. Si se pasa `selectedIds`, solo se exportan esas. */
  orders: OdooSaleOrder[];
  selectedIds?: Set<number> | null;
}

export function exportOrdersToExcel({ orders, selectedIds }: ExportOptions): void {
  const scoped = selectedIds && selectedIds.size > 0
    ? orders.filter(o => selectedIds.has(o.id))
    : orders;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(scoped), 'Resumen');
  XLSX.utils.book_append_sheet(wb, buildOrdersSheet(scoped), 'Órdenes');
  XLSX.utils.book_append_sheet(wb, buildPendingLinesSheet(scoped), 'Líneas pendientes');
  XLSX.utils.book_append_sheet(wb, buildDeliveriesSheet(scoped), 'Remisiones');
  XLSX.writeFile(wb, `ordenes_odoo_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
}
