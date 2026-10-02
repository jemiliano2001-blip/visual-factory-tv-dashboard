/**
 * Barra de filtros compartida por los tabs Pendientes, Órdenes y Entregas:
 * búsqueda de texto, cliente y estado.
 */
import { Input } from '../ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/select';
import { Search } from 'lucide-react';
import type { OrderStatusFilter } from './orderStatusMeta';

const ALL_CLIENTS = '__all__';

interface OrdersFilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;

  clientFilter: string;
  onClientFilterChange: (v: string) => void;
  clients: string[];

  statusFilter: OrderStatusFilter;
  onStatusFilterChange: (v: OrderStatusFilter) => void;
}

export default function OrdersFilterBar({
  search, onSearchChange, clientFilter, onClientFilterChange, clients,
  statusFilter, onStatusFilterChange,
}: OrdersFilterBarProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="order-search" className="sr-only">Buscar SO, PO, OT, ingeniero, cliente o producto</label>
          <Input
            id="order-search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar SO, PO del cliente, OT o ingeniero…"
            aria-describedby="order-search-help"
            className="pl-10"
          />
        </div>
        <Select
          value={clientFilter || ALL_CLIENTS}
          onValueChange={v => onClientFilterChange(v && v !== ALL_CLIENTS ? v : '')}
        >
          <SelectTrigger aria-label="Filtrar por cliente" className="w-[210px]">
            <SelectValue placeholder="Todos los clientes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CLIENTS}>Todos los clientes</SelectItem>
            {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => onStatusFilterChange(v as OrderStatusFilter)}>
          <SelectTrigger aria-label="Filtrar por estado de entrega" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="overdue">Atrasadas</SelectItem>
            <SelectItem value="warning">Por vencer</SelectItem>
            <SelectItem value="on-time">En tiempo</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p id="order-search-help" className="text-xs text-muted-foreground">
        Incluye el PO del cliente, todas las descripciones y notas. Ejemplo: PO20264321.
      </p>
    </div>
  );
}
