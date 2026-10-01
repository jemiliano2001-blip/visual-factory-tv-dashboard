import React from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { format } from 'date-fns';
import { OdooConnectionStatus } from '../services/odoo';

interface OdooStatusBadgeProps {
  status: OdooConnectionStatus | null;
  lastUpdated: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

const OdooStatusBadge: React.FC<OdooStatusBadgeProps> = ({
  status,
  lastUpdated,
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
        {lastUpdated && connected && (
          <span className="hidden sm:inline text-muted-foreground/70 font-normal normal-case tracking-normal whitespace-nowrap">
            · {format(new Date(lastUpdated), 'HH:mm')}
          </span>
        )}
      </div>
    </div>
  );
};

export default OdooStatusBadge;
