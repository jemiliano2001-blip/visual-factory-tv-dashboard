import React from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { OdooConnectionStatus } from '../services/odoo';
import { useDataFreshness } from '../hooks/useDataFreshness';

interface OdooStatusBadgeProps {
  status: OdooConnectionStatus | null;
  lastUpdated: string | null;
  /** Odoo tiene más órdenes de las que el proxy devuelve */
  truncated?: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const OdooStatusBadge: React.FC<OdooStatusBadgeProps> = ({
  status,
  lastUpdated,
  truncated,
  onRefresh,
  isRefreshing,
}) => {
  const connected = status?.connected ?? null;
  const freshness = useDataFreshness(lastUpdated);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Actualizar datos de Odoo"
        aria-label="Actualizar datos de Odoo"
        className="cursor-pointer p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-secondary-foreground hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 transition-all disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
        {connected === null ? (
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        ) : connected ? (
          <Wifi className="w-3.5 h-3.5 text-success" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-destructive" />
        )}
        <span className={connected === null ? 'text-muted-foreground' : connected ? 'text-success' : 'text-destructive'}>
          {connected === null ? 'Odoo...' : connected ? 'Odoo' : 'Sin Odoo'}
        </span>
        {truncated && (
          <span title="Odoo tiene más órdenes por facturar de las que se muestran" className="rounded bg-warning/20 px-1.5 py-0.5 text-warning">
            Incompleto
          </span>
        )}
        {freshness && connected !== null && (
          <span
            title={freshness.stale ? 'Los datos llevan más de 10 minutos sin actualizarse' : undefined}
            className={`hidden sm:inline font-normal normal-case tracking-normal whitespace-nowrap ${
              freshness.stale ? 'font-semibold text-warning' : 'text-muted-foreground'
            }`}
          >
            · {freshness.stale && (
              <AlertTriangle className="mr-1 inline size-3.5 align-text-bottom" aria-hidden="true" />
            )}
            {connected ? '' : 'datos de '}
            <span className="font-mono-data tabular-nums">{freshness.clock}</span> ({freshness.relative})
          </span>
        )}
      </div>
    </div>
  );
};

export default OdooStatusBadge;
