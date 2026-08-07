import type { OdooSaleOrder } from '../services/odoo';
import { getCustomerLogo } from '../utils/customerLogos';
import type { SharedTVPageData } from '../utils/tvPagePacking';
import OdooOrderCard, { type ScreenTier } from './OdooOrderCard';

interface SharedTVPageProps {
  page: SharedTVPageData;
  gridCols: number;
  gridRows: number;
  isWide: boolean;
  isDense: boolean;
  screenTier: ScreenTier;
  highlightedSO: string | null;
  onOrderClick: (order: OdooSaleOrder) => void;
}

export function SharedTVPage({ page, gridCols, gridRows, isWide, isDense, screenTier, highlightedSO, onOrderClick }: SharedTVPageProps) {
  const cards = page.segments.flatMap(segment => segment.orders.map(order => ({
    order,
    badge: { name: segment.company, logoUrl: getCustomerLogo(segment.company) ?? null },
  })));

  return (
    <div className="flex flex-col h-full min-h-0 w-full">
      <div className="mb-3 lg:mb-4 flex items-center justify-between flex-shrink-0">
        <h2 className={`${isWide ? 'text-4xl lg:text-5xl' : 'text-xl lg:text-2xl'} font-black text-white tracking-tight uppercase`}>
          MÚLTIPLES CLIENTES
        </h2>
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          {page.segments.length} {page.segments.length === 1 ? 'cliente' : 'clientes'}
        </span>
      </div>
      <div
        className="grid gap-3 lg:gap-4 flex-1 min-h-0"
        style={{
          gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
        }}
      >
        {cards.map(({ order, badge }) => (
          <OdooOrderCard
            key={order.id}
            order={order}
            companyBadge={badge}
            isHighlighted={highlightedSO === order.name}
            isWide={isWide}
            isDense={isDense}
            screenTier={screenTier}
            viewMode="tv"
            onClick={() => onOrderClick(order)}
          />
        ))}
      </div>
    </div>
  );
}
