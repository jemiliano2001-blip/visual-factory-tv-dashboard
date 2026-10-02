import React from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { OdooConnectionStatus } from '../services/odoo';

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
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        title="Actualizar datos de Odoo"
        className="p-1.5 rounded-lg bg-card border border-border text-muted-foreground hover:text-secondary-foreground hover:bg-secondary transition-all disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
        {connected === null ? (
          <div className="w-2 h-2 rounded-full bg-muted-foreground animate-pulse" />
        ) : connected ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-red-400" />
        )}
        <span className={connected === null ? 'text-muted-foreground' : connected ? 'text-emerald-400' : 'text-red-400'}>
          {connected === null ? 'Odoo...' : connected ? 'Odoo' : 'Sin Odoo'}
        </span>
        {truncated && (
          <span title="Odoo tiene más órdenes por facturar de las que se muestran" className="rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">
            Incompleto
          </span>
        )}
        {lastUpdated && connected !== null && (
          <span className="hidden sm:inline text-muted-foreground/70 font-normal normal-case tracking-normal whitespace-nowrap">
            · {connected ? '' : 'datos de '}{format(new Date(lastUpdated), 'HH:mm')}
          </span>
        )}
      </div>
    </div>
  );
};

export default OdooStatusBadge;
