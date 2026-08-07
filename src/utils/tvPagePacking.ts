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
  segments: SharedCompanySegment[];
}

export type TVPage = CompanyTVPage | SharedTVPageData;

const MAX_CLIENTS_PER_SHARED_PAGE = 2;

export function buildTVPages(orders: OdooSaleOrder[], ordersPerPage: number): TVPage[] {
  const capacity = Number.isFinite(ordersPerPage) && ordersPerPage > 0
    ? Math.max(1, Math.floor(ordersPerPage)) : 1;
  const byCompany = new Map<string, OdooSaleOrder[]>();
  for (const order of orders) {
    const group = byCompany.get(order.partner_name) ?? [];
    group.push(order);
    byCompany.set(order.partner_name, group);
  }

  const complete: CompanyTVPage[] = [];
  const remainders: SharedCompanySegment[] = [];
  for (const [company, companyOrders] of byCompany) {
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
  if (remainders.length === 0) return complete;
  if (remainders.length === 1) {
    const [remainder] = remainders;
    const companyPages = complete.filter(page => page.company === remainder.company);
    const total = companyPages.length + 1;
    const numberedComplete = complete.map(page => page.company === remainder.company
      ? { ...page, total }
      : page);
    return [
      ...numberedComplete,
      { type: 'company', ...remainder, current: total, total },
    ];
  }

  const remainderPages: TVPage[] = [];
  let remainderIndex = 0;
  let orderOffset = 0;
  while (remainderIndex < remainders.length) {
    let remainingSlots = capacity;
    const segments: SharedCompanySegment[] = [];
    while (remainingSlots > 0 && remainderIndex < remainders.length && segments.length < MAX_CLIENTS_PER_SHARED_PAGE) {
      const remainder = remainders[remainderIndex];
      const chunk = remainder.orders.slice(orderOffset, orderOffset + remainingSlots);
      segments.push({ company: remainder.company, orders: chunk });
      remainingSlots -= chunk.length;
      orderOffset += chunk.length;
      if (orderOffset === remainder.orders.length) {
        remainderIndex++;
        orderOffset = 0;
      }
    }
    if (segments.length === 1) {
      const [segment] = segments;
      const companyPages = complete.filter(page => page.company === segment.company);
      if (companyPages.length > 0) {
        const total = companyPages.length + 1;
        for (let pageIndex = 0; pageIndex < complete.length; pageIndex++) {
          if (complete[pageIndex].company === segment.company) {
            complete[pageIndex] = { ...complete[pageIndex], total };
          }
        }
        remainderPages.push({ type: 'company', ...segment, current: total, total });
      } else {
        remainderPages.push({ type: 'company', ...segment });
      }
    } else {
      remainderPages.push({ type: 'shared', segments });
    }
  }
  return [...complete, ...remainderPages];
}
