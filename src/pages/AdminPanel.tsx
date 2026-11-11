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
import {
  DEFAULT_ADMIN_FILTERS, UNASSIGNED_ENGINEER, parseAdminFilters, serializeAdminFilters,
  type AdminFilters,
} from '../services/adminFilters';
import {
  cacheAssignments, claimOrdersRemote, fetchOrderAssignments, loadCachedAssignments, releaseOrdersRemote,
} from '../services/orderAssignments';
import {
  actorEngineerId, claimOrders, getOrderEngineerId, releaseOrders, type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';
import { auth } from '../firebase';
import PendingTab from '../components/admin/PendingTab';
import OrdersTable from '../components/admin/OrdersTable';
import AdminToolbar from '../components/admin/AdminToolbar';
import SelectionBar from '../components/admin/SelectionBar';
import ConfigTab from '../components/admin/ConfigTab';
import RequestsTab from '../components/admin/RequestsTab';
import TruncatedNotice from '../components/admin/TruncatedNotice';
import { loadErrorLabel } from '../services/orderLoadError';
import { RequestDialog } from '../components/RequestDialog';
import { useInvoiceRequests } from '../hooks/useInvoiceRequests';
import { pendingRequestsByOrder } from '../../shared/invoiceRequests';
import OrderReportTab from '../components/admin/OrderReportTab';
import { Button } from '../components/ui/button';
import { getSection, hasActiveFilters, restoreSavedFilters, sectionFromFilters } from '../services/adminSections';
import { TooltipProvider } from '../components/ui/tooltip';
import {
  WifiOff, AlertTriangle, Loader2, RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';

const SAVED_FILTERS_KEY = 'adminFilters';

const BIG_BUTTON = 'min-h-11 px-4 text-sm font-semibold rounded-xl';

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
  const section = sectionFromFilters(filters);
  useEffect(() => { setRowSelection({}); }, [section]);

  const restoredRef = useRef(false);
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true;
      const saved = readSavedFilters();
      const restored = restoreSavedFilters(filters, saved ? parseAdminFilters(saved) : null);
      if (restored) {
        setParams(serializeAdminFilters(restored), { replace: true });
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
  const selectedCount = section === 'company' ? selectedOrders.length : 0;

  const filterEmpty = getSection(section).hasToolbar && !isLoading && orders.length > 0
    && filteredOrders.length === 0 && hasActiveFilters(filters);

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
        <div className={`mx-auto max-w-[1600px] p-5 lg:p-8 ${selectedCount > 0 ? 'pb-56 md:pb-28' : ''}`}>
          <div className="order-report-no-print space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {getSection(section).label}
                </h1>
                {lastUpdated && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Actualizado <span className="font-mono-data tabular-nums">{format(new Date(lastUpdated), 'HH:mm')}</span>
                  </p>
                )}
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

            <div>
              {getSection(section).hasToolbar && (
                <div className="mt-5">
                  <AdminToolbar
                    filters={filters}
                    onChange={updateFilters}
                    clients={uniqueClients}
                    engineers={team.engineers.map(e => ({ id: e.id, name: e.name, count: engineerCounts.counts.get(e.id) ?? 0 }))}
                    totalCount={orders.length}
                    unassignedCount={engineerCounts.unassigned}
                    shownCount={filteredOrders.length}
                    showGroupToggle={section === 'company'}
                    groupByClient={groupByClient}
                    onToggleGroup={() => setGroupByClient(g => !g)}
                    onExport={handleExport}
                    exportLabel={selectedCount > 0 ? `Excel (${selectedCount})` : 'Excel'}
                    exportDisabled={filteredOrders.length === 0}
                  />
                </div>
              )}

              {filterEmpty && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
                  <p className="text-base font-semibold text-foreground">Ninguna orden coincide con estos filtros</p>
                  <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={() => updateFilters({ search: '', client: '', engineer: '', status: 'all' })}>
                    Limpiar filtros
                  </Button>
                </div>
              )}

              {!filterEmpty && activeTab === 'orders' && (
              <div className="mt-4">
                {isLoading ? (
                  <LoadingState />
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
              </div>
              )}

              {activeTab === 'requests' && <div className="mt-5"><RequestsTab /></div>}

              {activeTab === 'config' && <div className="mt-5"><ConfigTab orders={orders} /></div>}
            </div>
          </div>

          {/* Tabla formal: solo se ve al imprimir, con las órdenes filtradas de cualquier vista. */}
          <div className="hidden print:block">
            <OrderReportTab orders={filteredOrders} getEngineerName={getEngineerName} />
          </div>
        </div>

        <SelectionBar
          count={selectedCount}
          onRequest={() => setRequestOpen(true)}
          onClaim={claimSelected}
          claimDisabled={!me}
          onExport={handleExport}
          onClear={() => setRowSelection({})}
        />

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
