/**
 * Consola de administración — herramienta de trabajo diaria del equipo de
 * diseño sobre las órdenes por facturar de Odoo (mismos datos que la TV).
 * No hay CRUD de órdenes: Odoo es la única fuente de verdad, todo es read-only;
 * lo único que se guarda aquí es qué ingeniero/diseñador de SMV lleva cada SO.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RowSelectionState } from '@tanstack/react-table';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { getOrderStatus, type OdooSaleOrder } from '../services/odoo';
import { createOrderSearchMatcher } from '../services/orderSearch';
import type { OrderStatusFilter } from '../components/admin/orderStatusMeta';
import {
  DEFAULT_ADMIN_FILTERS, ORDER_VIEWS, UNASSIGNED_ENGINEER, parseAdminFilters, serializeAdminFilters,
  type AdminFilters, type AdminTab, type OrderView,
} from '../services/adminFilters';
import {
  cacheAssignments, claimOrdersRemote, fetchOrderAssignments, loadCachedAssignments, releaseOrdersRemote,
} from '../services/orderAssignments';
import {
  actorEngineerId, claimOrders, getOrderEngineerId, releaseOrders, type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';
import { auth } from '../firebase';
import PendingTab from '../components/admin/PendingTab';
import AgendaTab from '../components/admin/AgendaTab';
import OrdersTable from '../components/admin/OrdersTable';
import OrdersFilterBar from '../components/admin/OrdersFilterBar';
import DeliveriesTab from '../components/admin/DeliveriesTab';
import ConfigTab from '../components/admin/ConfigTab';
import RequestsTab from '../components/admin/RequestsTab';
import TruncatedNotice from '../components/admin/TruncatedNotice';
import { loadErrorLabel } from '../services/orderLoadError';
import { RequestDialog } from '../components/RequestDialog';
import { useInvoiceRequests } from '../hooks/useInvoiceRequests';
import { pendingRequestsByOrder } from '../../shared/invoiceRequests';
import OrderReportTab from '../components/admin/OrderReportTab';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  Download, WifiOff, AlertTriangle, Loader2, RefreshCw, Table2, Settings, Truck, Users2,
  Link2, Check, X, Printer, FileText,
} from 'lucide-react';
import { format } from 'date-fns';

const SAVED_FILTERS_KEY = 'adminFilters';

const TAB_CLASS = 'min-h-11 text-sm font-semibold';
const BIG_BUTTON = 'min-h-11 px-4 text-sm font-semibold rounded-xl';

const VIEW_LABEL: Record<OrderView, string> = {
  company: 'Por Compañía',
  agenda: 'Por Fecha / Agenda',
  pending: 'Solo Piezas Pendientes',
};

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

  // Pestaña, vista y filtros viven en el link (?tab=…&vista=…&ing=…&q=…&cliente=…&estado=…):
  // se pueden compartir, y al entrar sin parámetros se restaura el último filtro usado.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseAdminFilters(params), [params]);
  const { tab: activeTab, view, engineer: engineerFilter, search, client: clientFilter, status: statusFilter } = filters;
  const updateFilters = (patch: Partial<AdminFilters>) =>
    setParams(serializeAdminFilters({ ...filters, ...patch }), { replace: true });
  const setActiveTab = (tab: AdminTab) => updateFilters({ tab });
  const setView = (v: OrderView) => updateFilters({ view: v });
  const setEngineerFilter = (engineer: string) => updateFilters({ engineer });
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
  const [groupByClient, setGroupByClient] = useState(true);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [requestOpen, setRequestOpen] = useState(false);
  const invoiceRequests = useInvoiceRequests();
  const pendingByOrder = useMemo(
    () => (invoiceRequests.data ? pendingRequestsByOrder(invoiceRequests.data) : undefined),
    [invoiceRequests.data],
  );
  const pendingRequestCount = useMemo(
    () => invoiceRequests.data?.requests.filter(r => r.status === 'pendiente').length ?? 0,
    [invoiceRequests.data],
  );

  // ── Equipo de diseño / ingeniería ────────────────────────────────────────────

  const [team, setTeam] = useState(loadCachedAssignments);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Se relee cada minuto: así se ve cuando otra persona toma o suelta una orden.
  useEffect(() => {
    const load = () =>
      fetchOrderAssignments().then(setTeam).catch(err => setTeamError(err instanceof Error ? err.message : String(err)));
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const me = auth.currentUser;
  const myEngineerId = me ? actorEngineerId(me.uid) : null;

  /** Cambio propio (tomar o soltar): se pinta al instante y el servidor confirma. */
  const changeTeam = useCallback(async (
    local: (state: OrderAssignmentsPayload) => OrderAssignmentsPayload,
    remote: () => Promise<OrderAssignmentsPayload>,
  ) => {
    const previous = team;
    setTeamError(null);
    try {
      const optimistic = local(previous);
      setTeam(optimistic);
      cacheAssignments(optimistic);
      setTeam(await remote());
    } catch (err) {
      setTeam(previous);
      cacheAssignments(previous);
      setTeamError(err instanceof Error ? err.message : String(err));
    }
  }, [team]);

  const engineerNames = useMemo(() => new Map(team.engineers.map(e => [e.id, e.name])), [team.engineers]);
  const getEngineerId = useCallback((o: OdooSaleOrder) => getOrderEngineerId(team.assignments, o), [team.assignments]);
  const getEngineerName = useCallback(
    (o: OdooSaleOrder) => engineerNames.get(getEngineerId(o) ?? '') ?? null,
    [engineerNames, getEngineerId],
  );
  const isMine = useCallback((o: OdooSaleOrder) => myEngineerId !== null && getEngineerId(o) === myEngineerId, [getEngineerId, myEngineerId]);
  const claimForMe = (orderKeys: string[]) => {
    if (!me) return;
    void changeTeam(
      state => claimOrders(state, { uid: me.uid, name: me.displayName, email: me.email }, orderKeys),
      () => claimOrdersRemote(orderKeys),
    );
  };
  const releaseMine = (orderKeys: string[]) => {
    if (!me) return;
    void changeTeam(state => releaseOrders(state, me.uid, orderKeys), () => releaseOrdersRemote(orderKeys));
  };

  const engineerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;
    for (const o of orders) {
      const id = getEngineerId(o);
      if (id && engineerNames.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
      else unassigned += 1;
    }
    return { counts, unassigned };
  }, [orders, getEngineerId, engineerNames]);

  // ── Filtros ──────────────────────────────────────────────────────────────────

  const uniqueClients = useMemo(
    () => Array.from(new Set(orders.map(o => o.partner_name))).sort(),
    [orders]
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (engineerFilter === UNASSIGNED_ENGINEER) result = result.filter(o => getEngineerName(o) === null);
    else if (engineerFilter) result = result.filter(o => getEngineerId(o) === engineerFilter);
    if (clientFilter) result = result.filter(o => o.partner_name === clientFilter);
    if (statusFilter !== 'all') result = result.filter(o => getOrderStatus(o).level === statusFilter);
    if (search.trim()) result = result.filter(createOrderSearchMatcher(search));
    return result;
  }, [orders, engineerFilter, clientFilter, statusFilter, search, getEngineerId, getEngineerName]);

  // Solo lo que se ve en la tabla: una orden seleccionada y luego oculta por un filtro
  // no se envía, no se asigna, no se exporta ni se cuenta.
  const selectedOrders = useMemo(
    () => filteredOrders.filter(o => rowSelection[o.id]),
    [filteredOrders, rowSelection],
  );
  // La selección solo existe en Órdenes → Por Compañía; en otra pestaña o vista no cuenta.
  const selectedCount = activeTab === 'orders' && view === 'company' ? selectedOrders.length : 0;

  const hasActiveFilters = Boolean(search || clientFilter || engineerFilter || statusFilter !== 'all');
  const clearFilters = () => updateFilters({ search: '', client: '', engineer: '', status: 'all' });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // portapapeles no disponible (p. ej. http sin permisos): la URL ya está en la barra
    }
  };

  const claimSelected = () => {
    claimForMe(selectedOrders.map(o => o.name));
    setRowSelection({});
  };

  // ── Export Excel ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    const selectedIds = selectedCount > 0 ? new Set(selectedOrders.map(o => o.id)) : null;
    const { exportOrdersToExcel } = await import('../services/exportExcel');
    exportOrdersToExcel({ orders: filteredOrders, selectedIds, getEngineerName });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background font-sans text-foreground">
        <div className="mx-auto max-w-[1600px] p-5 lg:p-8">
          <div className="order-report-no-print space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Órdenes por facturar
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Solo lectura, desde Odoo
                  {lastUpdated && <> · actualizado <span className="font-mono-data tabular-nums">{format(new Date(lastUpdated), 'HH:mm')}</span></>}
                </p>
              </div>
              <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={isFetching ? 'animate-spin text-primary' : ''} />
                Actualizar
              </Button>
            </div>

            {error && !isLoading && (
              <div className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <WifiOff className="size-5 shrink-0" />
                <span className="font-bold">{loadErrorLabel(error)}</span>
              </div>
            )}

            {truncated && <TruncatedNotice />}

            {teamError && (
              <div role="alert" className="flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
                <AlertTriangle className="size-5 shrink-0" />
                <span>No se pudo sincronizar el equipo de ingenieros: {teamError}</span>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={v => setActiveTab(v as AdminTab)}>
              <TabsList>
                <TabsTrigger value="orders" className={TAB_CLASS}><Table2 /> Órdenes y Seguimiento</TabsTrigger>
                <TabsTrigger value="deliveries" className={TAB_CLASS}><Truck /> Entregas (Remisiones)</TabsTrigger>
                <TabsTrigger value="requests" className={TAB_CLASS}><FileText /> Solicitudes{pendingRequestCount > 0 ? ` (${pendingRequestCount})` : ''}</TabsTrigger>
                <TabsTrigger value="config" className={TAB_CLASS}><Settings /> Configuración</TabsTrigger>
              </TabsList>

              {(activeTab === 'orders' || activeTab === 'deliveries') && (
                <div className="mt-5 space-y-3">
                  {/* Apartado por diseñador / ingeniero */}
                  <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por diseñador o ingeniero">
                    <Button
                      type="button"
                      className={BIG_BUTTON}
                      variant={engineerFilter === '' ? 'default' : 'secondary'}
                      onClick={() => setEngineerFilter('')}
                    >
                      Todas ({orders.length})
                    </Button>
                    {team.engineers.map(e => (
                      <Button
                        key={e.id}
                        type="button"
                        className={BIG_BUTTON}
                        variant={engineerFilter === e.id ? 'default' : 'secondary'}
                        onClick={() => setEngineerFilter(e.id)}
                      >
                        {e.name} ({engineerCounts.counts.get(e.id) ?? 0})
                      </Button>
                    ))}
                    <Button
                      type="button"
                      className={BIG_BUTTON}
                      variant={engineerFilter === UNASSIGNED_ENGINEER ? 'default' : 'secondary'}
                      onClick={() => setEngineerFilter(UNASSIGNED_ENGINEER)}
                    >
                      Sin asignar ({engineerCounts.unassigned})
                    </Button>
                  </div>

                  {activeTab === 'orders' && (
                    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Vista de órdenes">
                      {ORDER_VIEWS.map(v => (
                        <Button
                          key={v}
                          type="button"
                          className={BIG_BUTTON}
                          variant={view === v ? 'default' : 'secondary'}
                          aria-pressed={view === v}
                          onClick={() => setView(v)}
                        >
                          {VIEW_LABEL[v]}
                        </Button>
                      ))}
                    </div>
                  )}

                  <OrdersFilterBar
                    search={search}
                    onSearchChange={setSearch}
                    clientFilter={clientFilter}
                    onClientFilterChange={setClientFilter}
                    clients={uniqueClients}
                    statusFilter={statusFilter}
                    onStatusFilterChange={setStatusFilter}
                  />

                  {selectedCount > 0 && activeTab === 'orders' && view === 'company' && (
                    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-3">
                      <span className="text-sm font-semibold text-foreground">
                        {selectedCount} {selectedCount === 1 ? 'orden seleccionada' : 'órdenes seleccionadas'}
                      </span>
                      <Button type="button" className={BIG_BUTTON} onClick={() => setRequestOpen(true)} disabled={selectedOrders.length === 0}>
                        <FileText /> Pedir factura o remisión
                      </Button>
                      <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={claimSelected} disabled={!me}>
                        Asignármelas
                      </Button>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-mono-data font-semibold tabular-nums text-foreground">{filteredOrders.length}</span> de{' '}
                      <span className="font-mono-data tabular-nums">{orders.length}</span> órdenes
                    </p>
                    {hasActiveFilters && (
                      <Button type="button" variant="ghost" className={BIG_BUTTON} onClick={clearFilters}>
                        <X /> Limpiar filtros
                      </Button>
                    )}
                    <div className="ml-auto flex flex-wrap gap-2">
                      <Button type="button" variant="ghost" className={BIG_BUTTON} onClick={copyLink} title="Copiar un link a esta vista con sus filtros">
                        {linkCopied ? <Check className="text-success" /> : <Link2 />}
                        {linkCopied ? 'Link copiado' : 'Copiar link'}
                      </Button>
                      {activeTab === 'orders' && view === 'company' && (
                        <Button
                          type="button"
                          className={BIG_BUTTON}
                          variant={groupByClient ? 'default' : 'secondary'}
                          aria-pressed={groupByClient}
                          onClick={() => setGroupByClient(g => !g)}
                        >
                          <Users2 /> {groupByClient ? 'Lista plana' : 'Agrupar por compañía'}
                        </Button>
                      )}
                      <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={() => window.print()} disabled={filteredOrders.length === 0}>
                        <Printer /> Imprimir / PDF
                      </Button>
                      <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={handleExport} disabled={filteredOrders.length === 0}>
                        <Download /> Excel{selectedCount > 0 ? ` (${selectedCount} seleccionadas)` : ''}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <TabsContent value="orders" className="mt-4">
                {isLoading ? (
                  <LoadingState />
                ) : view === 'agenda' ? (
                  <AgendaTab orders={filteredOrders} getEngineerName={getEngineerName} />
                ) : view === 'pending' ? (
                  <PendingTab orders={filteredOrders} getEngineerName={getEngineerName} />
                ) : (
                  <OrdersTable
                    orders={filteredOrders}
                    groupByClient={groupByClient}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    getEngineerName={getEngineerName}
                    isMine={isMine}
                    onClaim={claimForMe}
                    onRelease={releaseMine}
                    pendingByOrder={pendingByOrder}
                  />
                )}
              </TabsContent>

              <TabsContent value="deliveries" className="mt-4">
                {isLoading ? <LoadingState /> : <DeliveriesTab orders={filteredOrders} getEngineerName={getEngineerName} />}
              </TabsContent>

              <TabsContent value="requests" className="mt-5">
                <RequestsTab />
              </TabsContent>

              <TabsContent value="config" className="mt-5">
                <ConfigTab companyNames={uniqueClients} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Tabla formal: solo se ve al imprimir, con las órdenes filtradas de cualquier vista. */}
          <div className="hidden print:block">
            <OrderReportTab orders={filteredOrders} getEngineerName={getEngineerName} />
          </div>
        </div>

        <RequestDialog
          orders={selectedOrders}
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          onSent={() => setRowSelection({})}
        />
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
