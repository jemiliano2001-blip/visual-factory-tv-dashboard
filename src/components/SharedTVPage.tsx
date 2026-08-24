import { Clock } from 'lucide-react';
import type { OdooSaleOrder } from '../services/odoo';
import { getCenteredLastRowStart } from '../utils/tvGridLayout';
import type { SharedCompanySegment, SharedTVPageData } from '../utils/tvPagePacking';
import OdooOrderCard, { type ScreenTier } from './OdooOrderCard';
import CompanyBadge from './CompanyBadge';
import { getSmartCompanyName } from '../utils/customerNames';

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
function getSegmentCardColumns(
  segment: SharedCompanySegment,
  gridCols: number,
  gridRows: number,
  isQuadLayout: boolean,
) {
  if (isQuadLayout) {
    const availableRows = Math.max(Math.floor(gridRows / 2) - 1, 1);
    return Math.min(2, Math.max(1, Math.ceil(segment.orders.length / availableRows)));
  }

  const availableRows = Math.max(gridRows - 1, 1);
  return Math.min(gridCols, Math.max(1, Math.ceil(segment.orders.length / availableRows)));
}

function getCompanyNameSize(company: string, isQuadLayout: boolean) {
  const length = company.trim().length;

  if (isQuadLayout) {
    if (length > 90) return 'text-[9px] lg:text-[10px]';
    if (length > 54) return 'text-[10px] lg:text-xs';
    return 'text-xs lg:text-sm';
  }

  if (length > 110) return 'text-[10px] lg:text-xs';
  if (length > 70) return 'text-xs lg:text-sm';
  return 'text-sm lg:text-base';
}

export function SharedTVPage({ page, gridCols, gridRows, isWide, isDense, screenTier, highlightedSO, onOrderClick }: SharedTVPageProps) {
  const isQuadLayout = page.layout === 'quad';

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className={isQuadLayout
        ? 'grid flex-1 min-h-0 grid-cols-2 grid-rows-2 gap-3 lg:gap-4'
        : 'flex flex-1 min-h-0 gap-3 lg:gap-4'}
      >
        {page.segments.map((segment) => {
          const cardColumns = getSegmentCardColumns(segment, gridCols, gridRows, isQuadLayout);
          const cardRows = Math.ceil(segment.orders.length / cardColumns);
          const companyNameSize = getCompanyNameSize(segment.company, isQuadLayout);
          const deliveryTimes = segment.orders.find(o => o.delivery_times)?.delivery_times;
          const smartName = getSmartCompanyName(segment.company, 'card');

          return (
            <section
              key={segment.company}
              aria-label={segment.company + ': ' + segment.orders.length + ' ' + (segment.orders.length === 1 ? 'orden' : 'órdenes')}
              className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-card/35 shadow-inner ${
                isQuadLayout ? 'p-2.5 lg:p-3' : 'p-3 lg:p-4'
              }`}
              style={{
                ...(isQuadLayout ? {} : {
                  flexGrow: Math.min(Math.max(segment.orders.length, 2), 5),
                  flexBasis: 0,
                }),
              }}
            >
              <header className={`flex flex-none items-center gap-2 border-b border-white/10 pb-2 ${
                isQuadLayout ? 'mb-2 h-12 lg:mb-2.5 lg:h-14' : 'mb-3 h-12 lg:mb-4 lg:h-14 lg:gap-3'
              }`}>
                <CompanyBadge
                  company={segment.company}
                  size={isQuadLayout ? 'sm' : 'md'}
                />
                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <h3 className={`line-clamp-1 min-w-0 break-words font-black uppercase leading-tight tracking-tight text-white ${companyNameSize}`} title={segment.company}>
                    {smartName}
                  </h3>
                  {deliveryTimes && (
                    <div className="flex items-center gap-1 text-[10px] lg:text-[11px] text-cyan-300 font-mono-data font-semibold truncate mt-0.5" title={`Horario: ${deliveryTimes}`}>
                      <Clock className="w-3 h-3 text-cyan-400 shrink-0" aria-hidden="true" />
                      <span className="truncate">{deliveryTimes}</span>
                    </div>
                  )}
                </div>
                <span className="shrink-0 rounded-full border border-white/10 bg-zinc-900 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-zinc-400 lg:text-xs">
                  {segment.orders.length}
                </span>
              </header>

              <div
                className="grid flex-1 min-h-0 gap-2.5 lg:gap-3"
                style={{
                  gridTemplateColumns: 'repeat(' + (cardColumns * 2) + ', minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(' + cardRows + ', minmax(0, 1fr))',
                }}
              >
                {segment.orders.map((order, index) => {
                  const centeredStart = getCenteredLastRowStart(index, segment.orders.length, cardColumns);

                  return (
                    <div
                      key={order.id}
                      className="min-h-0"
                      style={{
                        gridColumn: centeredStart ? `${centeredStart} / span 2` : 'span 2',
                      }}
                    >
                      <OdooOrderCard
                        order={order}
                        isHighlighted={highlightedSO === order.name}
                        isWide={isWide}
                        isDense={isDense}
                        screenTier={screenTier}
                        viewMode="tv"
                        onClick={() => onOrderClick(order)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
