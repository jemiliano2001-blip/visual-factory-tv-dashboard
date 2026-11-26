import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export interface NetworkStatusIndicatorProps {
  compact?: boolean;
}

export function NetworkStatusIndicator({ compact = false }: NetworkStatusIndicatorProps) {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  if (compact) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="print:hidden fixed bottom-3 right-3 z-50 flex items-center gap-2 rounded-xl border border-warning/40 bg-warning/15 px-3 py-2 text-xs font-semibold text-warning shadow-overlay"
      >
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        <span>Sin conexión — últimos datos</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="print:hidden border-b border-warning/30 bg-warning/15 px-4 py-2 text-sm font-medium text-warning"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-2">
        <WifiOff className="size-4 shrink-0" aria-hidden="true" />
        <span>Sin conexión a la red — mostrando los últimos datos cargados</span>
      </div>
    </div>
  );
}
