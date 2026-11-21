/**
 * Estampado de planos para OT: franja con SO, cantidad, fecha y PO sobre el plano
 * (sin modificar la fuente). Portado de SMV Vision (`src/lib/planoOt.ts`) sin juegos,
 * máscara de cantidad ni foto isométrica: la ficha de pizarrón sale con el recuadro
 * "Sin isométrica". Cada plano puede repetirse N copias en un solo PDF.
 *
 * pdf-lib pesa ~500 KB: se importa dinámicamente para no ir en el bundle inicial.
 */
import type { PDFDocument, PDFFont, PDFPage, rgb as RgbFn } from 'pdf-lib';

export type PlanoOtPrintMode = 'blueprint' | 'board_ticket' | 'both';

export interface PlanoOtStamp {
  soNumber: string;
  cantidad: string;
  fecha: string;
  /** PO del cliente; se omite del sello si viene vacía. */
  poNumber?: string;
  partNumber?: string;
  customer?: string;
  piezaDescripcion?: string;
  /** 'blueprint' (defecto), 'board_ticket' o 'both' (ficha + plano). */
  mode?: PlanoOtPrintMode;
}

/** Envuelve incluso identificadores sin espacios; nunca reduce la letra. */
export function wrapStampText(text: string, measure: (text: string) => number, width: number): string[] {
  if (!Number.isFinite(width) || width <= 0) throw new Error('Ancho de encabezado inválido.');
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (line && measure(line + char) > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += char;
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines;
}

/** Sanitiza nombres de archivo para descargas seguras en cualquier sistema operativo. */
export function cleanFilename(name?: string | null, fallback = 'orden'): string {
  const cleaned = (name ?? '')
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .trim();
  return cleaned || fallback;
}

/** Texto seguro para las fuentes estándar de PDF (Helvetica / WinAnsi). */
export function sanitizeWinAnsi(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/[“”„‟«»]/g, '"')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[—–]/g, '-')
    .replace(/[•‣◦⁃∙]/g, '*')
    .replace(/[✓✔]/g, '[OK]')
    .replace(/[✂✄]/g, '-')
    .replace(/[\x00-\x1F\x7F-\x9F]+/g, ' ')
    .replace(/[^\x00-\xFF]/gu, '?');
}

function oneLine(value?: string | null): string {
  return sanitizeWinAnsi((value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim());
}

/** Renglón secundario del sello: fecha y, si la hay, la PO del cliente. */
export function stampDetailLine(stamp: Pick<PlanoOtStamp, 'fecha' | 'poNumber'>): string {
  const po = oneLine(stamp.poNumber ?? '');
  const fecha = `FECHA: ${oneLine(stamp.fecha) || '-'}`;
  return po ? `${fecha}     PO: ${po}` : fecha;
}

type Rgb = ReturnType<typeof RgbFn>;

/** Página de ficha: dos tarjetas (pizarrón y viajera) con los mismos datos. */
function addFichaPage(pdfDoc: PDFDocument, stamp: PlanoOtStamp, w: number, h: number, bold: PDFFont, regular: PDFFont, rgb: typeof RgbFn): void {
  const page = pdfDoc.addPage([w, h]);
  const black: Rgb = rgb(0, 0, 0);
  const white: Rgb = rgb(1, 1, 1);
  const so = oneLine(stamp.soNumber) || '-';

  const card = (x: number, y: number, cw: number, ch: number, isBoard: boolean) => {
    page.drawRectangle({ x, y, width: cw, height: ch, color: white, borderColor: black, borderWidth: 1.5 });
    const bannerH = 26;
    const bannerY = y + ch - bannerH;
    page.drawRectangle({ x, y: bannerY, width: cw, height: bannerH, color: black });
    page.drawText('SMV', { x: x + 10, y: bannerY + 8, size: 11, font: bold, color: white });
    const badge = isBoard ? 'PIZARRON' : 'VIAJERA';
    page.drawText(badge, { x: x + cw - bold.widthOfTextAtSize(badge, 9) - 10, y: bannerY + 8, size: 9, font: bold, color: white });

    const metricsH = 40;
    const metricsY = bannerY - metricsH;
    page.drawRectangle({ x, y: metricsY, width: cw, height: metricsH, color: white, borderColor: black, borderWidth: 0.8 });
    page.drawText('ORDEN (SO)', { x: x + 8, y: metricsY + metricsH - 12, size: 7, font: bold, color: black });
    page.drawText(so, { x: x + 8, y: metricsY + 8, size: 13, font: bold, color: black });
    const cantX = x + cw * 0.42;
    page.drawLine({ start: { x: cantX, y: metricsY }, end: { x: cantX, y: metricsY + metricsH }, color: black, thickness: 0.8 });
    page.drawText('CANTIDAD', { x: cantX + 8, y: metricsY + metricsH - 12, size: 7, font: bold, color: black });
    page.drawText(`${oneLine(stamp.cantidad) || '1'} PZS`, { x: cantX + 8, y: metricsY + 8, size: 14, font: bold, color: black });
    const poX = x + cw * 0.7;
    page.drawLine({ start: { x: poX, y: metricsY }, end: { x: poX, y: metricsY + metricsH }, color: black, thickness: 0.8 });
    page.drawText(`PO: ${oneLine(stamp.poNumber) || 'S/N'}`, { x: poX + 6, y: metricsY + metricsH - 14, size: 8, font: bold, color: black });
    page.drawText(`F: ${oneLine(stamp.fecha) || '-'}`, { x: poX + 6, y: metricsY + 8, size: 7, font: regular, color: black });

    const footerH = 16;
    const infoH = 48;
    const photoY = y + footerH + 4;
    const photoH = Math.max(40, metricsY - infoH - photoY);
    const infoY = photoY + photoH;
    page.drawText('PIEZA', { x: x + 8, y: infoY + infoH - 11, size: 7, font: bold, color: black });
    page.drawText(oneLine(stamp.partNumber || stamp.soNumber) || '-', { x: x + 40, y: infoY + infoH - 12, size: 10, font: bold, color: black });
    page.drawText(`CLIENTE: ${oneLine(stamp.customer) || 'SUPRAJIT'}`, { x: x + 8, y: infoY + infoH - 24, size: 7, font: regular, color: black });
    const detail = oneLine(stamp.piezaDescripcion);
    const row = detail ? (wrapStampText(detail, t => regular.widthOfTextAtSize(t, 7), cw - 20)[0] ?? '') : '';
    if (row) page.drawText(row, { x: x + 8, y: infoY + 6, size: 7, font: regular, color: black });

    page.drawRectangle({ x: x + 8, y: photoY, width: cw - 16, height: photoH, color: white, borderColor: black, borderWidth: 1 });
    page.drawText('Sin isometrica', { x: x + 16, y: photoY + 6, size: 8, font: bold, color: black });
    page.drawText(`SMV // FOLIO: ${so}`, { x: x + 8, y: y + 5, size: 6, font: regular, color: black });
    page.drawText('FIRMA DE RECIBIDO: _____________________', { x: x + cw - 168, y: y + 5, size: 6, font: regular, color: black });
  };

  const dash = { thickness: 1, dashArray: [5, 4], color: rgb(0.35, 0.35, 0.35) };
  if (w >= h) {
    const cw = w / 2 - 18;
    card(12, 12, cw, h - 24, true);
    card(w / 2 + 6, 12, cw, h - 24, false);
    page.drawLine({ start: { x: w / 2, y: 8 }, end: { x: w / 2, y: h - 8 }, ...dash });
  } else {
    const ch = h / 2 - 18;
    card(12, h / 2 + 6, w - 24, ch, true);
    card(12, 12, w - 24, ch, false);
    page.drawLine({ start: { x: 8, y: h / 2 }, end: { x: w - 8, y: h / 2 }, ...dash });
  }
}

/** Devuelve los bytes del plano con la franja de OT (y la ficha si el modo la pide). */
export async function stampPlanoOt(pdfBytes: Uint8Array, stamp: PlanoOtStamp): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb, degrees } = await import('pdf-lib');
  const source = await PDFDocument.load(pdfBytes);
  if (source.getPageCount() === 0) throw new Error('El PDF no tiene páginas.');

  // Selección y salida comparten la misma página visible, incluso con /Rotate=90.
  const original = source.getPage(0);
  const crop = original.getCropBox();
  const rotation = ((original.getRotation().angle % 360) + 360) % 360;
  const sideways = rotation === 90 || rotation === 270;
  const width = sideways ? crop.height : crop.width;
  const height = sideways ? crop.width : crop.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 100 || height < 100) {
    throw new Error('El tamaño del plano no permite preparar una OT legible.');
  }

  const pdfDoc = await PDFDocument.create();
  const embedded = original.node.Contents() ? await pdfDoc.embedPage(original, {
    left: crop.x, bottom: crop.y, right: crop.x + crop.width, top: crop.y + crop.height,
  }) : null;
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const mode: PlanoOtPrintMode = stamp.mode ?? 'blueprint';
  if (mode === 'board_ticket' || mode === 'both') addFichaPage(pdfDoc, stamp, width, height, bold, regular, rgb);
  if (mode === 'board_ticket') return pdfDoc.save();

  const margin = Math.max(6, Math.min(10, width * 0.012));
  const padding = Math.max(4, Math.min(7, width * 0.008));
  const usableWidth = width - (margin + padding) * 2;
  const largeSize = Math.max(10.5, Math.min(14, width * 0.018));

  const primary = `SO: ${oneLine(stamp.soNumber) || '-'}     CANT: ${oneLine(stamp.cantidad) || '-'}     ${stampDetailLine(stamp)}`;
  const rows = wrapStampText(primary, t => bold.widthOfTextAtSize(t, largeSize), usableWidth);

  const boxH = padding * 2 + rows.length * largeSize * 1.25;
  const scale = (height - (boxH + margin * 2)) / height;
  if (scale < 0.85) throw new Error('El encabezado no cabe sin reducir demasiado el plano.');

  const availableHeight = height * scale;
  const xOffset = (width - width * scale) / 2;
  const page: PDFPage = pdfDoc.addPage([width, height]);
  if (embedded) {
    page.drawPage(embedded, {
      x: rotation === 180 || rotation === 270 ? xOffset + width * scale : xOffset,
      y: rotation === 90 || rotation === 180 ? availableHeight : 0,
      xScale: scale,
      yScale: scale,
      rotate: degrees(-rotation),
    });
  }
  page.drawRectangle({
    x: margin, y: availableHeight + margin, width: width - margin * 2, height: boxH,
    color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1.5,
  });
  let y = height - margin - padding;
  for (const text of rows) {
    y -= largeSize;
    page.drawText(text, { x: margin + padding, y, size: largeSize, font: bold, color: rgb(0, 0, 0) });
    y -= largeSize * 0.25;
  }

  // Las páginas restantes del plano se conservan.
  const remaining = source.getPageIndices().slice(1);
  if (remaining.length) for (const other of await pdfDoc.copyPages(source, remaining)) pdfDoc.addPage(other);
  return pdfDoc.save();
}

export interface PrintPdfItem {
  pdfBytes: Uint8Array;
  stamp: PlanoOtStamp;
  copies: number;
}

/**
 * Un solo PDF con cada plano estampado repetido `copies` veces, en el orden recibido.
 * Si el modo pide ficha de pizarrón, sale una sola vez por plano, antes de sus copias.
 */
export async function buildPrintPdf(items: PrintPdfItem[]): Promise<Uint8Array> {
  if (items.length === 0) throw new Error('No hay planos seleccionados para imprimir.');
  if (items.some(i => !Number.isInteger(i.copies) || i.copies < 1)) throw new Error('El número de copias debe ser un entero de 1 o más.');

  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();
  const append = async (bytes: Uint8Array) => {
    const sub = await PDFDocument.load(bytes);
    for (const page of await merged.copyPages(sub, sub.getPageIndices())) merged.addPage(page);
  };

  for (const item of items) {
    const mode = item.stamp.mode ?? 'blueprint';
    if (mode !== 'blueprint') await append(await stampPlanoOt(item.pdfBytes, { ...item.stamp, mode: 'board_ticket' }));
    if (mode !== 'board_ticket') {
      const stamped = await stampPlanoOt(item.pdfBytes, { ...item.stamp, mode: 'blueprint' });
      for (let i = 0; i < item.copies; i++) await append(stamped);
    }
  }
  return merged.save();
}

/** Abre el PDF en una pestaña nueva (diálogo de impresión del navegador); si hay bloqueo de pop-up, lo descarga. */
export function openPdfForPrint(bytes: Uint8Array, filename = 'planos-ot.pdf'): void {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
