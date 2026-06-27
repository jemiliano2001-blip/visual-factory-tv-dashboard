import React from 'react';
import type { ScreenTier } from './OdooOrderCard';

interface SkeletonCardProps {
  isWide: boolean;
  isDense?: boolean;
  screenTier?: ScreenTier;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ isWide, isDense, screenTier = 'lg' }) => {
  const big = isWide || screenTier === 'xl';

  if (isDense) {
    return (
      <div className="flex items-center pl-5 pr-3 lg:pr-4 py-3 lg:py-4 rounded-2xl border border-zinc-800 bg-card animate-pulse h-full gap-3 relative overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-2.5 bg-zinc-700" />
        <div className="w-5 h-5 rounded-full bg-zinc-800 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="h-4 w-24 bg-zinc-800 rounded-md" />
            <div className="h-3 w-12 bg-zinc-800 rounded-md" />
          </div>
          <div className="h-3 w-full bg-zinc-800 rounded-md" />
          <div className="h-2 w-full bg-zinc-800 rounded-full mt-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col pl-5 pr-3.5 py-4 rounded-2xl border border-zinc-800 bg-card animate-pulse h-full relative overflow-hidden">
      <div className={`absolute left-0 top-0 bottom-0 ${big ? 'w-3' : 'w-2.5'} bg-zinc-700`} />
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-2">
          <div className={`${big ? 'h-8 w-40' : 'h-7 w-28'} bg-zinc-800 rounded-md`} />
          <div className={`h-3 ${big ? 'w-44' : 'w-32'} bg-zinc-800 rounded-md`} />
        </div>
        <div className="h-6 w-16 bg-zinc-800 rounded-full" />
      </div>
      <div className={`h-12 w-full bg-zinc-800 rounded-md ${big ? 'mb-8' : 'mb-6'}`} />
      <div className="mt-auto space-y-4">
        <div className="flex justify-between items-end">
          <div className="h-4 w-20 bg-zinc-800 rounded-md" />
          <div className={`${big ? 'h-9 w-16' : 'h-7 w-12'} bg-zinc-800 rounded-md`} />
        </div>
        <div className={`${big ? 'h-4' : 'h-3'} w-full bg-zinc-800 rounded-full`} />
      </div>
    </div>
  );
};

export default SkeletonCard;
