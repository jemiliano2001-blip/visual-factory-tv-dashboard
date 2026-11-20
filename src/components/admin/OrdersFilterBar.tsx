/**
 * Controles de filtro compartidos por las secciones de órdenes (Por compañía,
 * Pendientes): búsqueda de texto, cliente y estado.
 * AdminToolbar los coloca en una sola fila (o en un Drawer en móvil).
 */
import type React from 'react';
import { Input } from '../ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/select';
import { Search, X } from 'lucide-react';
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
  value, onChange, className = 'min-w-0', inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <label htmlFor="order-search" className="sr-only">Buscar SO, PO, OT, ingeniero, cliente o producto</label>
      <Input
        ref={inputRef}
        id="order-search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder="Buscar SO, PO del cliente, OT o ingeniero…"
        aria-describedby="order-search-help"
        className={value ? 'pl-10 pr-10' : 'pl-10'}
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef?.current?.focus();
          }}
          aria-label="Limpiar búsqueda"
          title="Limpiar búsqueda"
          className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
      <p id="order-search-help" className="sr-only">
        Busca en SO, PO del cliente, descripciones y notas. Ejemplo: PO20264321. Pulsa / para enfocar.
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
