import React from 'react';

interface SkeletonCardProps {
  isWide: boolean;
  isDense?: boolean;
}

const SkeletonCard: React.FC<SkeletonCardProps> = ({ isWide, isDense }) => {
  if (isDense) {
    return (
      <div className="flex items-center p-3 lg:p-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/40 animate-pulse h-full gap-3">
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
    <div className="flex flex-col p-4 rounded-2xl border-2 border-zinc-800 bg-zinc-900/40 animate-pulse h-full">
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-2">
          <div className={`h-6 ${isWide ? 'w-32' : 'w-24'} bg-zinc-800 rounded-md`} />
          <div className={`h-3 ${isWide ? 'w-40' : 'w-32'} bg-zinc-800 rounded-md`} />
        </div>
        <div className="h-6 w-16 bg-zinc-800 rounded-full" />
      </div>
      <div className={`h-12 w-full bg-zinc-800 rounded-md ${isWide ? 'mb-8' : 'mb-6'}`} />
      <div className="mt-auto space-y-4">
        <div className="flex justify-between items-end">
          <div className="h-4 w-20 bg-zinc-800 rounded-md" />
          <div className="h-6 w-12 bg-zinc-800 rounded-md" />
        </div>
        <div className="h-2.5 w-full bg-zinc-800 rounded-full" />
      </div>
    </div>
  );
};

export default SkeletonCard;
