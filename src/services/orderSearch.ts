import type { OdooSaleOrder } from './odoo';

type SearchableOrder = Pick<OdooSaleOrder, 'name' | 'partner_name' | 'main_product' | 'salesperson' | 'note'> & {
  customer_reference?: string | null;
  lines?: Array<{ name: string }>;
};

function normalizeSearchText(value: string, normalizeReferences = true): string {
  const plain = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const references = normalizeReferences
    ? plain.replace(/\b(ot|po|so|ov|s)[\s/#:.-]*0*(\d+)/g, (_, prefix: string, digits: string) =>
      `${prefix === 'ot' || prefix === 'po' ? prefix : 'so'} ${digits}`)
    : plain;
  return references
    .replace(/\b(?:ing|ingeniera)\b/g, 'ingeniero')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function plainNote(note: string | null): string {
  return (note ?? '').replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Math.min(Number(code), 0x10FFFF)))
    .replace(/&amp;/g, '&');
}

/** Todos los términos deben aparecer; OT e ingeniero vienen de descripciones/notas de Odoo. */
export function createOrderSearchMatcher(query: string): (order: SearchableOrder) => boolean {
  const terms = normalizeSearchText(query).match(/\b(?:ot|po|so) \d+|[a-z0-9]+/g) ?? [];
  return order => {
    if (!terms.length) return true;
    const fields = [
      order.name, order.partner_name, order.main_product, order.customer_reference,
      order.customer_reference ? `PO ${order.customer_reference}` : null,
      order.salesperson, ...(order.lines ?? []).map(line => line.name), plainNote(order.note),
    ].filter((value): value is string => typeof value === 'string' && Boolean(value));
    const texts = fields.flatMap(value => [normalizeSearchText(value), normalizeSearchText(value, false)]);
    return terms.every(term => texts.some(text => text.includes(term)));
  };
}

export function matchesOrderSearch(order: SearchableOrder, query: string): boolean {
  return createOrderSearchMatcher(query)(order);
}
