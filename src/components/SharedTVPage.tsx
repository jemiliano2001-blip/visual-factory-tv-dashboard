import type { OdooSaleOrder } from '../services/odoo';
import { getCustomerLogo } from '../utils/customerLogos';
import type { SharedCompanySegment, SharedTVPageData } from '../utils/tvPagePacking';
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
function getSegmentCardColumns(segment: SharedCompanySegment, gridCols: number, gridRows: number) {
  const availableRows = Math.max(gridRows - 1, 1);
  return Math.min(gridCols, Math.max(1, Math.ceil(segment.orders.length / availableRows)));
}

export function SharedTVPage({ page, gridCols, gridRows, isWide, isDense, screenTier, highlightedSO, onOrderClick }: SharedTVPageProps) {
  const segmentCount = page.segments.length;
  const totalOrders = page.segments.reduce((total, segment) => total + segment.orders.length, 0);

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="mb-3 flex items-center justify-between gap-3 lg:mb-4">
        <h2 className={isWide ? 'text-4xl font-black tracking-tight text-white uppercase lg:text-5xl' : 'text-xl font-black tracking-tight text-white uppercase lg:text-2xl'}>
          MÚLTIPLES CLIENTES
        </h2>
        <span className="shrink-0 text-right text-xs font-bold uppercase tracking-widest text-zinc-500">
          {segmentCount} {segmentCount === 1 ? 'cliente' : 'clientes'} · {totalOrders} {totalOrders === 1 ? 'orden' : 'órdenes'}
        </span>
      </div>

      <div className="flex flex-1 min-h-0 gap-3 lg:gap-4">
        {page.segments.map((segment) => {
          const cardColumns = getSegmentCardColumns(segment, gridCols, gridRows);
          const cardRows = Math.ceil(segment.orders.length / cardColumns);
          const logoUrl = getCustomerLogo(segment.company);

          return (
            <section
              key={segment.company}
              aria-label={segment.company + ': ' + segment.orders.length + ' ' + (segment.orders.length === 1 ? 'orden' : 'órdenes')}
              className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/35 p-3 shadow-inner lg:p-4"
              style={{
                flexGrow: Math.min(Math.max(segment.orders.length, 2), 5),
                flexBasis: 0,
              }}
            >
              <header className="mb-3 flex min-h-9 items-center gap-2 border-b border-white/10 pb-2 lg:mb-4 lg:min-h-10 lg:gap-3">
                {logoUrl && (
                  <img src={logoUrl} alt="" className="h-8 w-8 rounded-md bg-white object-contain p-0.5 lg:h-9 lg:w-9" />
                )}
                <h3 className="min-w-0 flex-1 truncate text-sm font-black uppercase tracking-tight text-white lg:text-base" title={segment.company}>
                  {segment.company}
                </h3>
                <span className="shrink-0 rounded-full border border-white/10 bg-zinc-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 lg:text-xs">
                  {segment.orders.length}
                </span>
              </header>

              <div
                className="grid flex-1 min-h-0 gap-2.5 lg:gap-3"
                style={{
                  gridTemplateColumns: 'repeat(' + cardColumns + ', minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(' + cardRows + ', minmax(0, 1fr))',
                }}
              >
                {segment.orders.map((order) => (
                  <OdooOrderCard
                    key={order.id}
                    order={order}
                    isHighlighted={highlightedSO === order.name}
                    isWide={isWide}
                    isDense={isDense}
                    screenTier={screenTier}
                    viewMode="tv"
                    onClick={() => onOrderClick(order)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
