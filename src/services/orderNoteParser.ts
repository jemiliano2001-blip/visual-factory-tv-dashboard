/**
 * Extrae de una orden de Odoo la PO del cliente y el requisitor (quien pidió
 * en la compañía). En el taller suelen venir dentro de la nota como
 * "Ing. Edgar Ramirez/PO.00088347", no siempre en customer_reference.
 * Sin DOM: corre igual en navegador, Node (tests) y Functions.
 */

export interface OrderNoteMeta {
  poNumber: string | null;
  clientContact: string | null;
  cleanNote: string;
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

const PO_PREFIX = /^(?:P\.?\s?O\.?|O\.?\s?C\.?)[\s./:#-]*/i;
const PO_IN_NOTE = /\b(?:PO|P\.O\.|OC|O\.C\.)[\s./:#-]*([A-Z0-9][A-Z0-9._-]{2,})\b/i;
const MAX_CONTACT_LENGTH = 60;

function codePointToString(code: number, original: string): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*(?:br|\/p|\/div|\/li)\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => codePointToString(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec: string) => codePointToString(Number(dec), m))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePo(raw: string): string | null {
  const po = raw.trim().replace(PO_PREFIX, '').trim();
  return po || null;
}

export function extractOrderNoteMeta(order: { customer_reference?: string | null; note?: string | null }): OrderNoteMeta {
  const text = order.note ? htmlToText(order.note) : '';
  const reference = order.customer_reference?.trim();
  const noteMatch = text.match(PO_IN_NOTE);
  const poNumber = reference ? normalizePo(reference) : (noteMatch ? noteMatch[1] : null);

  // Encabezado "<Nombre> / [PO...]" al inicio de la nota.
  const slash = text.indexOf('/');
  const head = slash > 0 ? text.slice(0, slash).trim() : '';
  const rest = text.slice(slash + 1).trim();
  const restMatch = rest.match(PO_IN_NOTE);
  const isContact = head !== '' && head.length <= MAX_CONTACT_LENGTH && !PO_IN_NOTE.test(head) && !/\d/.test(head)
    && (rest === '' || restMatch?.index === 0 || head.split(/\s+/).length >= 2);
  if (!isContact) return { poNumber, clientContact: null, cleanNote: text };

  const cleanNote = restMatch && restMatch.index === 0 ? rest.slice(restMatch[0].length).trim() : rest;
  return { poNumber, clientContact: head, cleanNote };
}
