/**
 * Consola de administración — herramienta de trabajo diaria del equipo de
 * diseño sobre las órdenes por facturar de Odoo (mismos datos que la TV).
 * No hay CRUD de órdenes: Odoo es la única fuente de verdad, todo es read-only.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RowSelectionState } from '@tanstack/react-table';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { getOrderStatus } from '../services/odoo';
import { createOrderSearchMatcher } from '../services/orderSearch';
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';
import {
  DEFAULT_ADMIN_FILTERS, parseAdminFilters, serializeAdminFilters, type AdminFilters, type AdminTab,
} from '../services/adminFilters';
import PendingTab from '../components/admin/PendingTab';
import AgendaTab from '../components/admin/AgendaTab';
import OrdersTable from '../components/admin/OrdersTable';
import OrdersFilterBar from '../components/admin/OrdersFilterBar';
import DeliveriesTab from '../components/admin/DeliveriesTab';
import ConfigTab from '../components/admin/ConfigTab';
import OrderReportTab from '../components/admin/OrderReportTab';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  Download, WifiOff, AlertTriangle, Loader2, RefreshCw, Table2, Settings, FileText, ListChecks, Truck, Users2,
  CalendarDays, Link2, Check, X,
} from 'lucide-react';
import { format } from 'date-fns';

const SAVED_FILTERS_KEY = 'adminFilters';

/** Último filtro usado (sin pestaña): se restaura al entrar a /admin sin parámetros. */
function readSavedFilters(): URLSearchParams | null {
  try {
    const raw = localStorage.getItem(SAVED_FILTERS_KEY);
    return raw ? new URLSearchParams(raw) : null;
  } catch {
    return null;
  }
}

function saveFilters(filters: AdminFilters) {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, serializeAdminFilters({ ...filters, tab: DEFAULT_ADMIN_FILTERS.tab }).toString());
  } catch {
    // sin almacenamiento disponible: el link sigue funcionando
  }
}

export default function AdminPanel() {
  const { orders, error, truncated, isLoading, isFetching, lastUpdated, refetch } = useOdooOrders();

  // Pestaña y filtros viven en el link (?tab=…&q=…&cliente=…&estado=…): se pueden
  // compartir, y al entrar sin parámetros se restaura el último filtro usado.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(params), [params]);
  const { tab: activeTab, search, client: clientFilter, status: statusFilter } = filters;
  const updateFilters = (patch: Partial<AdminFilters>) =>
    setParams(serializeAdminFilters({ ...filters, ...patch }), { replace: true });
  const setActiveTab = (tab: AdminTab) => updateFilters({ tab });
  const setSearch = (q: string) => updateFilters({ search: q });
  const setClientFilter = (client: string) => updateFilters({ client });
  const setStatusFilter = (status: OrderStatusFilter) => updateFilters({ status });
  const [linkCopied, setLinkCopied] = useState(false);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true;
      const saved = readSavedFilters();
      if (params.size === 0 && saved && saved.size > 0) {
        setParams(serializeAdminFilters({ ...parseAdminFilters(saved), tab: filters.tab }), { replace: true });
        return;
      }
    }
    saveFilters(filters);
  }, [filters, params, setParams]);
  const [groupByClient, setGroupByClient] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const uniqueClients = useMemo(
    () => Array.from(new Set(orders.map(o => o.partner_name))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (clientFilter) result = result.filter(o => o.partner_name === clientFilter);
    if (statusFilter !== 'all') result = result.filter(o => getOrderStatus(o).level === statusFilter);
    if (search.trim()) result = result.filter(createOrderSearchMatcher(search));
    return result;
  }, [orders, clientFilter, statusFilter, search]);

  const selectedCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection]
  );

  const hasActiveFilters = Boolean(search || clientFilter || statusFilter !== 'all');
  const clearFilters = () => updateFilters({ search: '', client: '', status: 'all' });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // portapapeles no disponible (p. ej. http sin permisos): la URL ya está en la barra
    }
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    const selectedIds = selectedCount > 0
      ? new Set(Object.entries(rowSelection).filter(([, v]) => v).map(([id]) => Number(id)))
      : null;
    const { exportOrdersToExcel } = await import('../services/exportExcel');
    exportOrdersToExcel({ orders: filteredOrders, selectedIds });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <div className="mx-auto max-w-[1600px] space-y-5 p-5 lg:p-8">
          {/* Cabecera */}
          <div className="order-report-no-print flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Órdenes por facturar
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Solo lectura, desde Odoo
                {lastUpdated && <> · actualizado <span className="font-mono-data tabular-nums">{format(new Date(lastUpdated), 'HH:mm')}</span></>}
              </p>
            </div>
            <Button type="button" variant="secondary" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin text-primary' : ''} />
              Actualizar
            </Button>
          </div>

          {error && !isLoading && (
            <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
              <WifiOff className="size-5 shrink-0" />
              <span className="font-bold">SIN CONEXIÓN A ODOO — {error}</span>
            </div>
          )}

          {truncated && <TruncatedNotice />}

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)}>
            <TabsList>
              <TabsTrigger value="pending"><ListChecks /> Pendientes</TabsTrigger>
              <TabsTrigger value="agenda"><CalendarDays /> Agenda</TabsTrigger>
              <TabsTrigger value="orders"><Table2 /> Órdenes</TabsTrigger>
              <TabsTrigger value="deliveries"><Truck /> Entregas</TabsTrigger>
              <TabsTrigger value="report"><FileText /> Reporte</TabsTrigger>
              <TabsTrigger value="config"><Settings /> Configuración</TabsTrigger>
            </TabsList>

            {activeTab !== 'config' && (
              <div className="order-report-no-print mt-5 space-y-3">
                <OrdersFilterBar
                  search={search}
                  onSearchChange={setSearch}
                  clientFilter={clientFilter}
                  onClientFilterChange={setClientFilter}
                  clients={uniqueClients}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-mono-data font-semibold tabular-nums text-foreground">{filteredOrders.length}</span> de{' '}
                    <span className="font-mono-data tabular-nums">{orders.length}</span> órdenes
                  </p>
                  {hasActiveFilters && (
                    <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
                      <X /> Limpiar filtros
                    </Button>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button type="button" variant="ghost" onClick={copyLink} title="Copiar un link a esta vista con sus filtros">
                      {linkCopied ? <Check className="text-success" /> : <Link2 />}
                      {linkCopied ? 'Link copiado' : 'Copiar link'}
                    </Button>
                    {activeTab === 'orders' && (
                      <Button
                        type="button"
                        variant={groupByClient ? 'default' : 'secondary'}
                        onClick={() => setGroupByClient(g => !g)}
                      >
                        <Users2 /> Agrupar por cliente
                      </Button>
                    )}
                    <Button type="button" variant="secondary" onClick={handleExport} disabled={filteredOrders.length === 0}>
                      <Download /> Excel{selectedCount > 0 ? ` (${selectedCount} seleccionadas)` : ''}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <TabsContent value="pending" className="mt-4">
              {isLoading ? (
                <LoadingState />
              ) : (
                <PendingTab orders={filteredOrders} />
              )}
            </TabsContent>

            <TabsContent value="agenda" className="mt-4">
              {isLoading ? <LoadingState /> : <AgendaTab orders={filteredOrders} />}
            </TabsContent>

            <TabsContent value="orders" className="mt-4">
              {isLoading ? (
                <LoadingState />
              ) : (
                <OrdersTable
                  orders={filteredOrders}
                  groupByClient={groupByClient}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                />
              )}
            </TabsContent>

            <TabsContent value="deliveries" className="mt-4">
              {isLoading ? <LoadingState /> : <DeliveriesTab orders={filteredOrders} />}
            </TabsContent>

            <TabsContent value="report" className="mt-5">
              <OrderReportTab orders={filteredOrders} />
            </TabsContent>

            <TabsContent value="config" className="mt-5">
              <ConfigTab companyNames={uniqueClients} />
            </TabsContent>
          </Tabs>
        </div>

      </div>
    </TooltipProvider>
  );
}

function TruncatedNotice() {
  return (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      <AlertTriangle className="size-5 shrink-0" />
      <span>Odoo tiene más órdenes por facturar de las que se muestran; faltan las de fecha compromiso más lejana.</span>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" /> Cargando órdenes de Odoo…
    </div>
  );
}
