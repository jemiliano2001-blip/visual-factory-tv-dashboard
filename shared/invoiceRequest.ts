/**
 * Correo a facturación con las solicitudes recién guardadas. El servidor arma el
 * mensaje desde lo que guardó (nunca desde el navegador) y los destinatarios
 * viven solo en functions/.env.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const fmtQty = (n: number) => String(Math.round(n * 100) / 100);

/** Solicitud ya guardada (forma estructural de InvoiceRequest; shared no importa entre archivos). */
export interface MailableRequest {
  orderName: string;
  partnerName: string;
  customerReference: string | null;
  type: 'factura' | 'remision';
  lines?: { name: string; qty: number; unit: string | null }[];
}

export function buildRequestsEmail(
  requests: MailableRequest[],
  actor: { email: string | null; name: string | null; uid: string },
) {
  if (requests.length === 0) throw new Error('Se requiere al menos una solicitud.');
  const facturas = requests.filter(r => r.type === 'factura');
  const remisiones = requests.filter(r => r.type === 'remision');
  const counts = [
    facturas.length ? `${facturas.length} ${facturas.length > 1 ? 'facturas' : 'factura'}` : '',
    remisiones.length ? `${remisiones.length} ${remisiones.length > 1 ? 'remisiones' : 'remisión'}` : '',
  ].filter(Boolean).join(' y ');
  const subject = `Solicitud de ${counts}: ${[...new Set(requests.map(r => r.orderName))].join(', ')}`;
  const who = (actor.name || actor.email || actor.uid).replace(/\s+/g, ' ').trim().slice(0, 80);
  const intro = `Buen día, ${who} pide lo siguiente:`;
  const head = (r: MailableRequest) =>
    `${r.orderName} — ${r.partnerName}${r.customerReference ? ` (PO ${r.customerReference})` : ''}`;
  const pieces = (r: MailableRequest) =>
    (r.lines ?? []).map(l => `${fmtQty(l.qty)}${l.unit ? ` ${l.unit}` : ''} — ${l.name}`);
  const groups = [['Facturas', facturas], ['Remisiones', remisiones]] as const;

  const text = [intro, ...groups.filter(([, rs]) => rs.length).map(([title, rs]) => [
    '', `${title}:`,
    ...rs.map(r => [`  ${head(r)}`, ...pieces(r).map(l => `    • ${l}`)].join('\n')),
  ].join('\n')), '', 'Gracias.'].join('\n');

  const html = [`<p>${escapeHtml(intro)}</p>`, ...groups.filter(([, rs]) => rs.length).map(([title, rs]) =>
    `<h3>${title}</h3>` + rs.map(r =>
      `<p><strong>${escapeHtml(head(r))}</strong></p>` +
      (pieces(r).length ? `<ul>${pieces(r).map(l => `<li>${escapeHtml(l)}</li>`).join('')}</ul>` : '')).join('')),
    '<p>Gracias.</p>'].join('');
  return { subject, text, html };
}

/**
 * Remitente y destinatarios. Gmail solo deja enviar desde la cuenta autenticada, así que el
 * correo sale con el nombre de quien pidió, con copia a esa persona y con "responder a" su
 * correo: lo que conteste Mari le llega a ella, no a la cuenta del dashboard.
 */
export function buildMailEnvelope(
  config: { user: string; to: string; cc?: string },
  actor: { uid: string; name: string | null; email: string | null },
) {
  const label = (actor.name ?? '').replace(/["\\\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  const person = actor.email?.trim() || '';
  const cc: string[] = [];
  for (const addr of [config.cc ?? '', person]) {
    if (addr && !cc.some(c => c.toLowerCase() === addr.toLowerCase())) cc.push(addr);
  }
  return {
    from: `"${label ? `${label} (Visual Factory)` : 'Visual Factory'}" <${config.user}>`,
    to: config.to,
    ...(cc.length ? { cc: cc.join(', ') } : {}),
    ...(person ? { replyTo: person } : {}),
  };
}
