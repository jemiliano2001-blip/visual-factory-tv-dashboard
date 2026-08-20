/**
 * Barra de filtros compartida por los tabs Pendientes, Órdenes y Entregas:
 * búsqueda IA en lenguaje natural, búsqueda de texto, cliente y estado.
 */
import React from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '../ui/select';
import { Search, Sparkles, Loader2, X } from 'lucide-react';
import type { OrderStatusFilter } from './orderStatusMeta';

const ALL_CLIENTS = '__all__';

interface OrdersFilterBarProps {
  nlQuery: string;
  onNlQueryChange: (v: string) => void;
  onNlSubmit: (e: React.FormEvent) => void;
  isSearchingAI: boolean;
  aiFilterCount: number | null;
  onClearAIFilter: () => void;

  search: string;
  onSearchChange: (v: string) => void;

  clientFilter: string;
  onClientFilterChange: (v: string) => void;
  clients: string[];

  statusFilter: OrderStatusFilter;
  onStatusFilterChange: (v: OrderStatusFilter) => void;
}

export default function OrdersFilterBar({
  nlQuery, onNlQueryChange, onNlSubmit, isSearchingAI, aiFilterCount, onClearAIFilter,
  search, onSearchChange, clientFilter, onClientFilterChange, clients,
  statusFilter, onStatusFilterChange,
}: OrdersFilterBarProps) {
  return (
    <div className="space-y-2">
      <form onSubmit={onNlSubmit} className="flex flex-wrap gap-2">
        <div className="relative min-w-[260px] flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-primary" />
          <label htmlFor="ai-order-query" className="sr-only">Búsqueda con IA</label>
          <Input
            id="ai-order-query"
            value={nlQuery}
            onChange={e => onNlQueryChange(e.target.value)}
            placeholder='Búsqueda IA: "las de Nissan que están vencidas"…'
            className="pl-10"
          />
        </div>
        <Button type="submit" disabled={isSearchingAI || !nlQuery.trim()}>
          {isSearchingAI ? <Loader2 className="animate-spin" /> : <Sparkles />}
          Buscar con IA
        </Button>
        {aiFilterCount !== null && (
          <Button type="button" variant="ghost" onClick={onClearAIFilter}>
            <X /> Limpiar filtro IA ({aiFilterCount})
          </Button>
        )}
      </form>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="order-search" className="sr-only">Buscar órdenes</label>
          <Input
            id="order-search"
            value={search}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="Buscar SO, cliente o producto…"
            className="pl-10"
          />
        </div>
        <Select
          value={clientFilter || ALL_CLIENTS}
          onValueChange={v => onClientFilterChange(v === ALL_CLIENTS ? '' : v)}
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
    </div>
  );
}
