/**
 * Controles de filtro compartidos por las secciones de órdenes (Por compañía,
 * Pendientes, Agenda y Entregas): búsqueda de texto, cliente y estado.
 * AdminToolbar los coloca en una sola fila (o en un Drawer en móvil).
 */
import { Input } from '../ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/select';
import { Search } from 'lucide-react';
import type { OrderStatusFilter } from './orderStatusMeta';

const ALL_CLIENTS = '__all__';

export const STATUS_OPTIONS: ReadonlyArray<{ value: OrderStatusFilter; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'warning', label: 'Por vencer' },
  { value: 'on-time', label: 'En tiempo' },
  { value: 'none', label: 'Sin fecha' },
];

export function OrderSearchInput({
  value, onChange, className = 'min-w-0',
}: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <label htmlFor="order-search" className="sr-only">Buscar SO, PO, OT, ingeniero, cliente o producto</label>
      <Input
        id="order-search"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Buscar SO, PO del cliente, OT o ingeniero…"
        aria-describedby="order-search-help"
        className="pl-10"
      />
      <p id="order-search-help" className="sr-only">
        Busca en SO, PO del cliente, descripciones y notas. Ejemplo: PO20264321.
      </p>
    </div>
  );
}

export function ClientSelect({
  value, onChange, clients, className,
}: { value: string; onChange: (v: string) => void; clients: string[]; className?: string }) {
  return (
    <Select value={value || ALL_CLIENTS} onValueChange={v => onChange(v && v !== ALL_CLIENTS ? v : '')}>
      <SelectTrigger aria-label="Filtrar por cliente" className={className}>
        <SelectValue>{value || 'Todos los clientes'}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[50vh] overflow-y-auto">
        <SelectItem value={ALL_CLIENTS}>Todos los clientes</SelectItem>
        {clients.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function StatusSelect({
  value, onChange, className,
}: { value: OrderStatusFilter; onChange: (v: OrderStatusFilter) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={v => onChange(v as OrderStatusFilter)}>
      <SelectTrigger aria-label="Filtrar por estado de entrega" className={className}>
        <SelectValue>{STATUS_OPTIONS.find(o => o.value === value)?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STATUS_OPTIONS.map(({ value: v, label }) => (
          <SelectItem key={v} value={v}>{label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
