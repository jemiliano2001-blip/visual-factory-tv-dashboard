/**
 * Solicitud de factura por correo (para Mari). El servidor recibe solo nombres de
 * SO y arma el mensaje con los datos de Odoo: el navegador nunca decide el
 * contenido ni los destinatarios.
 */

export const MAX_INVOICE_REQUEST_ORDERS = 20;

export interface InvoiceRequestOrder {
  name: string;
  customer_reference: string | null;
  partner_name: string;
  lines: { name: string; qty: number; delivered: number; unit?: string }[];
  deliveries: { name: string; state: string; date_done: string | null }[];
}

export interface MailConfig { from: string; to: string; cc?: string }

export interface MailTransport {
  sendMail(options: { from: string; to: string; cc?: string; subject: string; text: string; html: string }): Promise<unknown>;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

const fmtDate = (odooDate: string | null) => {
  const m = odooDate?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

function describeOrder(order: InvoiceRequestOrder) {
  const header = `${order.name} — ${order.partner_name}${order.customer_reference ? ` (PO ${order.customer_reference})` : ''}`;
  const lines = order.lines.map(l => `${fmtQty(l.delivered)} de ${fmtQty(l.qty)}${l.unit ? ` ${l.unit}` : ''} — ${l.name}`);
  const deliveries = order.deliveries.filter(d => d.state !== 'cancel').map(d => {
    const date = fmtDate(d.date_done);
    return d.state === 'done' ? `${d.name} (entregada${date ? ` ${date}` : ''})` : `${d.name} (pendiente)`;
  });
  return { header, lines, deliveries };
}

export function buildInvoiceRequestEmail(orders: InvoiceRequestOrder[]) {
  if (orders.length === 0) throw new Error('Se requiere al menos una orden.');
  const plural = orders.length > 1;
  const names = orders.map(o => o.name).join(', ');
  const subject = `Solicitud de ${plural ? 'facturas' : 'factura'}: ${names}`;
  const intro = plural
    ? 'Buen día, quiero facturar las siguientes órdenes:'
    : `Buen día, quiero una factura para la ${orders[0].name}.`;

  const blocks = orders.map(describeOrder);
  const text = [
    intro,
    ...blocks.map(b => [
      '', b.header,
      ...b.lines.map(l => `  • ${l}`),
      b.deliveries.length ? `  Remisiones: ${b.deliveries.join(', ')}` : '  Remisiones: ninguna',
    ].join('\n')),
    '', 'Gracias.',
  ].join('\n');

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    ...blocks.map(b => [
      `<p><strong>${escapeHtml(b.header)}</strong></p>`,
      `<ul>${b.lines.map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>`,
      `<p>Remisiones: ${escapeHtml(b.deliveries.length ? b.deliveries.join(', ') : 'ninguna')}</p>`,
    ].join('')),
    '<p>Gracias.</p>',
  ].join('');

  return { subject, text, html };
}

export async function sendInvoiceRequest(args: {
  names: string[];
  orders: InvoiceRequestOrder[];
  config: MailConfig;
  transport: MailTransport;
}): Promise<{ sent: string[] }> {
  const { names, orders, config, transport } = args;
  if (names.length === 0) throw new Error('Selecciona al menos una orden.');
  if (names.length > MAX_INVOICE_REQUEST_ORDERS) throw new Error(`Máximo ${MAX_INVOICE_REQUEST_ORDERS} órdenes por correo.`);
  if (new Set(names).size !== names.length) throw new Error('Hay órdenes repetidas.');

  const byName = new Map(orders.map(o => [o.name, o]));
  const missing = names.filter(n => !byName.has(n));
  if (missing.length) throw new Error(`Órdenes no encontradas en Odoo: ${missing.join(', ')}`);

  const mail = buildInvoiceRequestEmail(names.map(n => byName.get(n)!));
  await transport.sendMail({ from: config.from, to: config.to, ...(config.cc ? { cc: config.cc } : {}), ...mail });
  return { sent: names };
}
