/**
 * Consola de administración — herramienta de trabajo diaria del equipo de
 * diseño sobre las órdenes por facturar de Odoo (mismos datos que la TV).
 * No hay CRUD de órdenes: Odoo es la única fuente de verdad, todo es read-only.
 */
import React, { useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { OdooSaleOrder, getOrderStatus } from '../services/odoo';
import { filterOrdersByNaturalLanguage, summarizePendingWork, explainOrderRequirements, AIError } from '../services/ai';
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';
import PendingTab from '../components/admin/PendingTab';
import OrdersTable from '../components/admin/OrdersTable';
import OrdersFilterBar from '../components/admin/OrdersFilterBar';
import DeliveriesTab from '../components/admin/DeliveriesTab';
import ConfigTab from '../components/admin/ConfigTab';
import OrderReportTab from '../components/admin/OrderReportTab';
import AIModal from '../components/admin/AIModal';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  Download, WifiOff, Loader2, RefreshCw, Table2, Settings, FileText, ListChecks, Truck, Users2,
} from 'lucide-react';
import { format } from 'date-fns';

type AdminTab = 'pending' | 'orders' | 'deliveries' | 'report' | 'config';

export default function AdminPanel() {
  const { orders, error, isLoading, isFetching, lastUpdated, refetch } = useOdooOrders();

  const [activeTab, setActiveTab] = useState<AdminTab>('pending');
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all');
  const [groupByClient, setGroupByClient] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // IA
  const [nlQuery, setNlQuery] = useState('');
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiFilterIds, setAiFilterIds] = useState<number[] | null>(null);
  const [aiModal, setAiModal] = useState<{ title: string; content: string | null } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [explainingId, setExplainingId] = useState<number | null>(null);

  const uniqueClients = useMemo(
    () => Array.from(new Set(orders.map(o => o.partner_name))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (aiFilterIds) result = result.filter(o => aiFilterIds.includes(o.id));
    if (clientFilter) result = result.filter(o => o.partner_name === clientFilter);
    if (statusFilter !== 'all') result = result.filter(o => getOrderStatus(o).level === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(o =>
        o.name.toLowerCase().includes(q) ||
        o.partner_name.toLowerCase().includes(q) ||
        o.main_product.toLowerCase().includes(q)
      );
    }
    return result;
  }, [orders, aiFilterIds, clientFilter, statusFilter, search]);

  const selectedCount = useMemo(
    () => Object.values(rowSelection).filter(Boolean).length,
    [rowSelection]
  );

  // ── Handlers IA ──────────────────────────────────────────────────────────────

  const handleNLSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlQuery.trim()) return;
    setAiFilterIds(null);
    setIsSearchingAI(true);
    try {
      const ids = await filterOrdersByNaturalLanguage(nlQuery, orders);
      setAiFilterIds(ids);
    } catch (err) {
      console.error('Error en búsqueda IA', err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al buscar.';
      setAiModal({ title: 'Error', content: msg });
    }
    setIsSearchingAI(false);
  };

  const clearAIFilter = () => {
    setAiFilterIds(null);
    setNlQuery('');
  };

  const handleSummarizePending = async () => {
    setIsSummarizing(true);
    setAiModal({ title: 'Plan del día', content: null });
    try {
      const text = await summarizePendingWork(filteredOrders);
      setAiModal({ title: 'Plan del día', content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al generar el plan.';
      setAiModal({ title: 'Error', content: msg });
    }
    setIsSummarizing(false);
  };

  const handleExplainRequirements = async (order: OdooSaleOrder) => {
    setExplainingId(order.id);
    setAiModal({ title: `Requisitos — ${order.name}`, content: null });
    try {
      const text = await explainOrderRequirements(order);
      setAiModal({ title: `Requisitos — ${order.name}`, content: text || 'Sin respuesta del modelo.' });
    } catch (err) {
      console.error(err);
      const msg = err instanceof AIError ? err.userMessage : 'Ocurrió un error inesperado al explicar la orden.';
      setAiModal({ title: 'Error', content: msg });
    }
    setExplainingId(null);
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
        <div className="mx-auto max-w-[1600px] space-y-6 p-6 lg:p-8">
          {/* Cabecera */}
          <div className="order-report-no-print flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
            <div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-foreground">
                Órdenes
              </h1>
              <p className="mt-1.5 font-mono-data text-xs uppercase tracking-widest text-muted-foreground">
                Órdenes por facturar — solo lectura
                {lastUpdated && ` · actualizado ${format(new Date(lastUpdated), 'HH:mm:ss')}`}
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

          <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)}>
            <TabsList>
              <TabsTrigger value="pending"><ListChecks /> Pendientes</TabsTrigger>
              <TabsTrigger value="orders"><Table2 /> Órdenes</TabsTrigger>
              <TabsTrigger value="deliveries"><Truck /> Entregas</TabsTrigger>
              <TabsTrigger value="report"><FileText /> Reporte</TabsTrigger>
              <TabsTrigger value="config"><Settings /> Configuración</TabsTrigger>
            </TabsList>

            {activeTab !== 'config' && (
              <div className="order-report-no-print mt-5 space-y-4">
                <OrdersFilterBar
                  nlQuery={nlQuery}
                  onNlQueryChange={setNlQuery}
                  onNlSubmit={handleNLSearch}
                  isSearchingAI={isSearchingAI}
                  aiFilterCount={aiFilterIds ? aiFilterIds.length : null}
                  onClearAIFilter={clearAIFilter}
                  search={search}
                  onSearchChange={setSearch}
                  clientFilter={clientFilter}
                  onClientFilterChange={setClientFilter}
                  clients={uniqueClients}
                  statusFilter={statusFilter}
                  onStatusFilterChange={setStatusFilter}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono-data font-bold text-foreground">{filteredOrders.length}</span> de{' '}
                    <span className="font-mono-data">{orders.length}</span> órdenes
                  </p>
                  <div className="ml-auto flex gap-2">
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
                <PendingTab orders={filteredOrders} onSummarize={handleSummarizePending} isSummarizing={isSummarizing} />
              )}
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
                  explainingId={explainingId}
                  onExplainRequirements={handleExplainRequirements}
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

        {aiModal && (
          <AIModal title={aiModal.title} content={aiModal.content} onClose={() => setAiModal(null)} />
        )}
      </div>
    </TooltipProvider>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted-foreground">
      <Loader2 className="size-6 animate-spin" /> Cargando órdenes de Odoo…
    </div>
  );
}
