import type { OdooSaleOrder } from '../services/odoo';

export interface CompanyTVPage {
  type: 'company';
  company: string;
  orders: OdooSaleOrder[];
  current?: number;
  total?: number;
}

export interface SharedCompanySegment {
  company: string;
  orders: OdooSaleOrder[];
}

export interface SharedTVPageData {
  type: 'shared';
  layout: 'split' | 'quad';
  segments: SharedCompanySegment[];
}

export type TVPage = CompanyTVPage | SharedTVPageData;

export interface TVPagePackingOptions {
  ordersPerPage: number;
  gridCols?: number;
  gridRows?: number;
}

const MAX_CLIENTS_PER_SHARED_PAGE = 4;
const MAX_ORDERS_PER_QUAD_SEGMENT = 4;
// Una empresa grande conserva todas sus páginas para sí misma, incluso la última
// incompleta. Evita que, por ejemplo, la página final de 25 órdenes se mezcle
// visualmente con otro cliente.
export const EXCLUSIVE_COMPANY_ORDER_THRESHOLD = 20;

interface NormalizedPackingOptions {
  capacity: number;
  gridCols: number;
  gridRows: number;
}

function normalizeOptions(options: number | TVPagePackingOptions): NormalizedPackingOptions {
  const rawCapacity = typeof options === 'number' ? options : options.ordersPerPage;
  const capacity = Number.isFinite(rawCapacity) && rawCapacity > 0
    ? Math.max(1, Math.floor(rawCapacity)) : 1;
  const gridCols = typeof options === 'number' ? capacity : options.gridCols ?? capacity;
  const gridRows = typeof options === 'number' ? 1 : options.gridRows ?? 1;

  return {
    capacity,
    gridCols: Math.max(1, Math.floor(gridCols)),
    gridRows: Math.max(1, Math.floor(gridRows)),
  };
}

function canUseQuadLayout({ capacity, gridCols, gridRows }: NormalizedPackingOptions) {
  // Cuatro bloques requieren dos filas y dos columnas cómodas, además de espacio
  // interior para que hasta cuatro órdenes por cliente conserven su lectura.
  return capacity >= 16 && gridCols >= 4 && gridRows >= 4;
}

function appendExclusiveRemainder(
  complete: CompanyTVPage[],
  remainderPages: TVPage[],
  segment: SharedCompanySegment,
) {
  const companyPages = complete.filter(page => page.company === segment.company);
  if (companyPages.length > 0) {
    const total = companyPages.length + 1;
    for (let pageIndex = 0; pageIndex < complete.length; pageIndex++) {
      if (complete[pageIndex].company === segment.company) {
        complete[pageIndex] = { ...complete[pageIndex], total };
      }
    }
    remainderPages.push({ type: 'company', ...segment, current: total, total });
    return;
  }

  remainderPages.push({ type: 'company', ...segment });
}

/**
 * Empaqueta clientes pequeños sin partirlos innecesariamente: primero aprovecha
 * cuadrantes 2x2 para hasta cuatro bloques pequeños y después empareja los
 * restantes por mejor ajuste. Las empresas de 20+ órdenes permanecen exclusivas.
 */
export function buildTVPages(orders: OdooSaleOrder[], options: number | TVPagePackingOptions): TVPage[] {
  const layout = normalizeOptions(options);
  const { capacity } = layout;
  const byCompany = new Map<string, OdooSaleOrder[]>();
  for (const order of orders) {
    const group = byCompany.get(order.partner_name) ?? [];
    group.push(order);
    byCompany.set(order.partner_name, group);
  }

  const complete: CompanyTVPage[] = [];
  const remainders: SharedCompanySegment[] = [];
  for (const [company, companyOrders] of byCompany) {
    if (companyOrders.length >= EXCLUSIVE_COMPANY_ORDER_THRESHOLD) {
      const total = Math.ceil(companyOrders.length / capacity);
      for (let pageIndex = 0; pageIndex < total; pageIndex++) {
        complete.push({
          type: 'company',
          company,
          orders: companyOrders.slice(pageIndex * capacity, (pageIndex + 1) * capacity),
          current: pageIndex + 1,
          total,
        });
      }
      continue;
    }

    const fullPageCount = Math.floor(companyOrders.length / capacity);
    for (let pageIndex = 0; pageIndex < fullPageCount; pageIndex++) {
      complete.push({
        type: 'company',
        company,
        orders: companyOrders.slice(pageIndex * capacity, (pageIndex + 1) * capacity),
        current: pageIndex + 1,
        total: fullPageCount,
      });
    }
    const remainder = companyOrders.slice(fullPageCount * capacity);
    if (remainder.length > 0) remainders.push({ company, orders: remainder });
  }

  const remainderPages: TVPage[] = [];
  const remainderPosition = new Map(remainders.map((segment, index) => [segment, index]));
  const quadEligible = canUseQuadLayout(layout)
    ? remainders.filter(segment => segment.orders.length <= MAX_ORDERS_PER_QUAD_SEGMENT)
    : [];
  const quadSegments = new Set(quadEligible);

  while (quadEligible.length >= 3) {
    const segments = quadEligible.splice(0, MAX_CLIENTS_PER_SHARED_PAGE);
    remainderPages.push({ type: 'shared', layout: 'quad', segments });
  }

  const pending = remainders.filter(segment => !quadSegments.has(segment) || quadEligible.includes(segment));
  const exclusiveSegmentLimit = Math.ceil(capacity * 0.7);
  const pairable = pending.filter(segment => segment.orders.length <= exclusiveSegmentLimit);
  const exclusive = pending.filter(segment => segment.orders.length > exclusiveSegmentLimit);

  // Best fit decreasing: cada cliente toma el compañero que más llena la pantalla
  // sin rebasar capacidad, en vez de depender del orden de llegada de Odoo.
  pairable.sort((a, b) => b.orders.length - a.orders.length);
  while (pairable.length > 0) {
    const primary = pairable.shift()!;
    let bestIndex = -1;
    let bestFill = -1;
    for (let index = 0; index < pairable.length; index++) {
      const fill = primary.orders.length + pairable[index].orders.length;
      if (fill <= capacity && fill > bestFill) {
        bestIndex = index;
        bestFill = fill;
      }
    }

    if (bestIndex === -1) {
      appendExclusiveRemainder(complete, remainderPages, primary);
      continue;
    }

    const partner = pairable.splice(bestIndex, 1)[0];
    const segments = [primary, partner].sort(
      (a, b) => remainderPosition.get(a)! - remainderPosition.get(b)!,
    );
    remainderPages.push({ type: 'shared', layout: 'split', segments });
  }

  for (const segment of exclusive) appendExclusiveRemainder(complete, remainderPages, segment);

  return [...complete, ...remainderPages];
}
