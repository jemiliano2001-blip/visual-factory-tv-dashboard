/**
 * Consola de administración — herramienta de trabajo diaria del equipo de
 * diseño sobre las órdenes por facturar de Odoo (mismos datos que la TV).
 * No hay CRUD de órdenes: Odoo es la única fuente de verdad, todo es read-only;
 * lo único que se guarda aquí es qué ingeniero/diseñador de SMV lleva cada SO.
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { RowSelectionState } from '@tanstack/react-table';
import { useOdooOrders } from '../hooks/useOdooOrders';
import { useOrderAssignments } from '../hooks/useOrderAssignments';
import { getOrderStatus, type OdooSaleOrder } from '../services/odoo';
import { createOrderSearchMatcher } from '../services/orderSearch';
import { extractOrderNoteMeta } from '../services/orderNoteParser';
import {
  DEFAULT_ADMIN_FILTERS, UNASSIGNED_ENGINEER, parseAdminFilters, serializeAdminFilters,
  type AdminFilters,
} from '../services/adminFilters';
import {
  assignOrdersRemote,
  claimOrdersRemote,
  followOrdersRemote,
  releaseOrdersRemote,
} from '../services/orderAssignments';
import {
  SUBTAB_ALL,
  actorEngineerId,
  assignOrders,
  buildMyOrdersSubtabs,
  claimOrders,
  followOrders,
  getOrderEngineerId,
  isOrderFollowedBy,
  isOrderInEngineerTray,
  matchesMyOrdersSubtab,
  releaseOrders,
  type AssignTarget,
  type OrderAssignmentsPayload,
} from '../../shared/orderAssignments';
import { auth } from '../firebase';
import ToolCribTab from '../components/admin/ToolCribTab';
import OrdersTable from '../components/admin/OrdersTable';
import AdminToolbar, { type TableDensity } from '../components/admin/AdminToolbar';
import SelectionBar from '../components/admin/SelectionBar';
import { AssignEngineerDialog, MyOrdersSubtabBar } from '../components/admin/AssignEngineerDialog';
import ConfigTab from '../components/admin/ConfigTab';
import RequestsTab from '../components/admin/RequestsTab';
import TruncatedNotice from '../components/admin/TruncatedNotice';
import { AdminLoadingSkeleton } from '../components/admin/AdminLoadingSkeletons';
import { loadErrorLabel } from '../services/orderLoadError';
import { RequestDialog } from '../components/RequestDialog';
import { useInvoiceRequests } from '../hooks/useInvoiceRequests';
import { pendingRequestsByOrder } from '../../shared/invoiceRequests';
import OrderReportTab from '../components/admin/OrderReportTab';
import { Button } from '../components/ui/button';
import { ContextMenu, type ContextMenuEntry } from '../components/ui/context-menu';
import { getSection, hasActiveFilters, restoreSavedFilters, sectionFromFilters } from '../services/adminSections';
import { usePersistedState } from '../hooks/usePersistedState';
import { useUserSettings } from '../hooks/useUserSettings';
import { startFiltersFor } from '../services/userSettings';
import { useMobile } from '../hooks/useMobile';
import { useDataFreshness } from '../hooks/useDataFreshness';
import { isEditableTarget, resolveAdminShortcut } from '../utils/keyboardShortcuts';
import {
  WifiOff, AlertTriangle, RefreshCw, Download, Eye, FileText, UserCheck, UserMinus, UserPlus, Copy, ChevronDown, ChevronRight, X,
} from 'lucide-react';

const OrderDetailsModal = lazy(() =>
  import('../components/OrderDetailsModal').then(m => ({ default: m.OrderDetailsModal })),
);

const SAVED_FILTERS_KEY = 'adminFilters';
const TOAST_DURATION_MS = 5000;

const BIG_BUTTON = 'min-h-11 px-4 text-sm font-semibold rounded-xl';

interface AdminToast {
  id: number;
  message: string;
  tone?: 'info' | 'error';
  action?: {
    label: string;
    onClick: () => void;
  };
}

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
  const isMobile = useMobile();
  const [groupByClient, setGroupByClient] = useState(true);
  const [density, setDensity] = usePersistedState<TableDensity>('vftv:admin:density', 'comfortable');
  const account = useUserSettings();
  // Al cargar la cuenta: densidad guardada y, si el link venía sin parámetros, vista de inicio y cliente seguido.
  const hadUrlParams = useRef(params.toString() !== '').current;
  const accountApplied = useRef(false);
  useEffect(() => {
    if (!account.loaded || isLoading || accountApplied.current) return;
    accountApplied.current = true;
    setDensity(account.settings.appearance.density);
    const start = startFiltersFor(account.settings, DEFAULT_ADMIN_FILTERS, hadUrlParams, [...new Set(orders.map(o => o.partner_name))]);
    if (start) setParams(serializeAdminFilters(start), { replace: true });
  }, [account.loaded, account.settings, isLoading, orders, hadUrlParams, setDensity, setParams]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [requestOpen, setRequestOpen] = useState(false);
  const [quickRequestOrder, setQuickRequestOrder] = useState<OdooSaleOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<OdooSaleOrder | null>(null);
  const [assignDialogKeys, setAssignDialogKeys] = useState<string[] | null>(null);
  const [mySubtab, setMySubtab] = useState<string>(SUBTAB_ALL);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    order: OdooSaleOrder;
    expanded?: boolean;
    toggleExpanded?: () => void;
  } | null>(null);
  const [toast, setToast] = useState<AdminToast | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const toastPausedRef = useRef(false);
  const toastSeqRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const freshness = useDataFreshness(lastUpdated);
  const invoiceRequests = useInvoiceRequests();
  const pendingByOrder = useMemo(
    () => (invoiceRequests.data ? pendingRequestsByOrder(invoiceRequests.data) : undefined),
    [invoiceRequests.data],
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToast(null);
  }, []);

  const scheduleToastTimer = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    if (toastPausedRef.current) return;
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, TOAST_DURATION_MS);
  }, []);

  const showToast = useCallback((next: Omit<AdminToast, 'id'>) => {
    toastPausedRef.current = false;
    setToast({ id: ++toastSeqRef.current, ...next });
    scheduleToastTimer();
  }, [scheduleToastTimer]);

  const pauseToastTimer = useCallback(() => {
    toastPausedRef.current = true;
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const resumeToastTimer = useCallback(() => {
    toastPausedRef.current = false;
    if (toastTimerRef.current === null && toast !== null) {
      scheduleToastTimer();
    }
  }, [scheduleToastTimer, toast]);

  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
  }, []);

  // ── Equipo de diseño / ingeniería ────────────────────────────────────────────

  const { team, fetchError: teamFetchError, setTeamData } = useOrderAssignments();
  const [mutationTeamError, setMutationTeamError] = useState<string | null>(null);
  const teamError = mutationTeamError ?? teamFetchError;
  const mountedRef = useRef(true);
  const teamRef = useRef(team);
  teamRef.current = team;
  const mutationSeqRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const me = auth.currentUser;
  const myEngineerId = me ? actorEngineerId(me.uid) : null;
  const myEngineerName = me ? (me.displayName || me.email || null) : null;

  /** Cambio propio (tomar o soltar): se pinta al instante y el servidor confirma. */
  const changeTeam = useCallback(async (
    local: (state: OrderAssignmentsPayload) => OrderAssignmentsPayload,
    remote: () => Promise<OrderAssignmentsPayload>,
  ): Promise<boolean> => {
    const seq = ++mutationSeqRef.current;
    const previous = teamRef.current;
    setMutationTeamError(null);
    try {
      const optimistic = local(previous);
      setTeamData(optimistic);
      const confirmed = await remote();
      if (!mountedRef.current || mutationSeqRef.current !== seq) return false;
      setTeamData(confirmed);
      return true;
    } catch (err) {
      if (!mountedRef.current || mutationSeqRef.current !== seq) return false;
      setTeamData(previous);
      dismissToast();
      setMutationTeamError(err instanceof Error ? err.message : String(err));
      return false;
    }
  }, [dismissToast, setTeamData]);

  const engineerNames = useMemo(() => new Map(team.engineers.map(e => [e.id, e.name])), [team.engineers]);
  const getEngineerId = useCallback((o: OdooSaleOrder) => getOrderEngineerId(team.assignments, o), [team.assignments]);
  const getEngineerName = useCallback(
    (o: OdooSaleOrder) => engineerNames.get(getEngineerId(o) ?? '') ?? null,
    [engineerNames, getEngineerId],
  );
  const isMine = useCallback((o: OdooSaleOrder) => myEngineerId !== null && getEngineerId(o) === myEngineerId, [getEngineerId, myEngineerId]);
  const isFollowedByMe = useCallback(
    (o: OdooSaleOrder) => isOrderFollowedBy(team.followers, myEngineerId, o),
    [team.followers, myEngineerId],
  );

  const releaseMine = useCallback((orderKeys: string[], options?: { silent?: boolean }) => {
    if (!me || orderKeys.length === 0) return;
    const mutation = changeTeam(
      state => releaseOrders(state, me.uid, orderKeys),
      () => releaseOrdersRemote(orderKeys),
    );
    if (!options?.silent) {
      const count = orderKeys.length;
      showToast({
        message: count === 1 ? 'Orden liberada' : `${count} órdenes liberadas`,
        action: {
          label: 'Deshacer',
          onClick: () => {
            dismissToast();
            void changeTeam(
              state => claimOrders(state, { uid: me.uid, name: me.displayName, email: me.email }, orderKeys),
              () => claimOrdersRemote(orderKeys),
            );
          },
        },
      });
    }
    void mutation;
  }, [me, changeTeam, showToast, dismissToast]);

  const claimForMe = useCallback((orderKeys: string[], options?: { silent?: boolean }) => {
    if (!me || orderKeys.length === 0) return;
    const currentAssignments = teamRef.current.assignments;
    const hadOtherOwner = orderKeys.some(key => {
      const direct = currentAssignments[key];
      const match = direct !== undefined ? null : orders.find(o => o.name === key);
      const owner = direct ?? (match ? getOrderEngineerId(currentAssignments, match) : null);
      return owner !== null && owner !== myEngineerId;
    });

    const mutation = changeTeam(
      state => claimOrders(state, { uid: me.uid, name: me.displayName, email: me.email }, orderKeys),
      () => claimOrdersRemote(orderKeys),
    );
    if (!options?.silent) {
      const count = orderKeys.length;
      showToast({
        message: count === 1 ? 'Orden asignada a ti' : `${count} órdenes asignadas a ti`,
        action: {
          label: hadOtherOwner ? 'Soltar' : 'Deshacer',
          onClick: () => {
            dismissToast();
            releaseMine(orderKeys, { silent: true });
          },
        },
      });
    }
    void mutation;
  }, [me, myEngineerId, orders, changeTeam, showToast, dismissToast, releaseMine]);

  const assignToEngineer = useCallback((orderKeys: string[], target: AssignTarget, label: string) => {
    if (!me || orderKeys.length === 0) return;
    const mutation = changeTeam(
      state => assignOrders(state, { uid: me.uid, name: me.displayName, email: me.email }, orderKeys, target),
      () => assignOrdersRemote(orderKeys, target),
    );
    const count = orderKeys.length;
    showToast({
      message: count === 1 ? `Orden asignada a ${label}` : `${count} órdenes asignadas a ${label}`,
      action: {
        label: 'Deshacer',
        onClick: () => {
          dismissToast();
          releaseMine(orderKeys, { silent: true });
        },
      },
    });
    void mutation;
  }, [me, changeTeam, showToast, dismissToast, releaseMine]);

  const followForMe = useCallback((orderKeys: string[]) => {
    if (!me || orderKeys.length === 0) return;
    const mutation = changeTeam(
      state => followOrders(state, { uid: me.uid, name: me.displayName, email: me.email }, orderKeys),
      () => followOrdersRemote(orderKeys),
    );
    const count = orderKeys.length;
    showToast({
      message: count === 1 ? 'Orden agregada a Mis órdenes' : `${count} órdenes agregadas a Mis órdenes`,
      action: {
        label: 'Deshacer',
        onClick: () => {
          dismissToast();
          releaseMine(orderKeys, { silent: true });
        },
      },
    });
    void mutation;
  }, [me, changeTeam, showToast, dismissToast, releaseMine]);

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

  const isMyOrdersFilter = Boolean(myEngineerId && engineerFilter === myEngineerId);
  useEffect(() => {
    if (!isMyOrdersFilter) setMySubtab(SUBTAB_ALL);
  }, [isMyOrdersFilter]);

  const myTrayCount = useMemo(
    () => (myEngineerId ? orders.filter(o => isOrderInEngineerTray(team, myEngineerId, o)).length : 0),
    [orders, team, myEngineerId],
  );

  const myOrdersSubtabs = useMemo(
    () => (isMyOrdersFilter ? buildMyOrdersSubtabs(team, myEngineerId, orders) : []),
    [isMyOrdersFilter, team, myEngineerId, orders],
  );

  const effectiveMySubtab = useMemo(
    () => (myOrdersSubtabs.some(t => t.id === mySubtab) ? mySubtab : SUBTAB_ALL),
    [myOrdersSubtabs, mySubtab],
  );

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (engineerFilter === UNASSIGNED_ENGINEER) {
      result = result.filter(o => getEngineerName(o) === null);
    } else if (isMyOrdersFilter) {
      result = result.filter(o => matchesMyOrdersSubtab(team, myEngineerId, effectiveMySubtab, o));
    } else if (engineerFilter) {
      result = result.filter(o => getEngineerId(o) === engineerFilter);
    }
    if (clientFilter) result = result.filter(o => o.partner_name === clientFilter);
    if (statusFilter !== 'all') result = result.filter(o => getOrderStatus(o).level === statusFilter);
    if (search.trim()) result = result.filter(createOrderSearchMatcher(search));
    return result;
  }, [
    orders, engineerFilter, isMyOrdersFilter, team, myEngineerId, effectiveMySubtab,
    clientFilter, statusFilter, search, getEngineerId, getEngineerName,
  ]);

  // Solo lo que se ve en la tabla: una orden seleccionada y luego oculta por un filtro
  // no se envía, no se asigna, no se exporta ni se cuenta.
  const selectedOrders = useMemo(
    () => filteredOrders.filter(o => rowSelection[o.id]),
    [filteredOrders, rowSelection],
  );
  // La selección solo existe en Órdenes → Por Compañía; en otra pestaña o vista no cuenta.
  const selectedCount = section === 'company' ? selectedOrders.length : 0;

  const dialogOrders = quickRequestOrder ? [quickRequestOrder] : selectedOrders;
  const isRequestDialogOpen = quickRequestOrder !== null || requestOpen;
  const activeDetailOrder = detailOrder
    ? (orders.find(o => o.id === detailOrder.id) ?? detailOrder)
    : null;

  const isAssignDialogOpen = assignDialogKeys !== null && assignDialogKeys.length > 0;
  const assignCurrentEngineerId = useMemo(() => {
    if (!assignDialogKeys || assignDialogKeys.length !== 1) return null;
    const key = assignDialogKeys[0];
    return team.assignments[key] ?? null;
  }, [assignDialogKeys, team.assignments]);

  const hasToolbar = getSection(section).hasToolbar;
  const filterEmpty = hasToolbar && !isLoading && orders.length > 0
    && filteredOrders.length === 0 && (hasActiveFilters(filters) || effectiveMySubtab !== SUBTAB_ALL);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const action = resolveAdminShortcut({
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        editable: isEditableTarget(e.target),
        dialogOpen: Boolean(activeDetailOrder || isRequestDialogOpen || isAssignDialogOpen),
        menuOpen: contextMenu !== null,
        hasSearchInput: hasToolbar && searchInputRef.current !== null,
      });
      if (action === 'focus-search') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDetailOrder, isRequestDialogOpen, isAssignDialogOpen, contextMenu, hasToolbar]);

  const claimSelected = () => {
    claimForMe(selectedOrders.map(o => o.name));
    setRowSelection({});
  };

  const openAssignSelected = () => {
    if (selectedOrders.length === 0) return;
    setAssignDialogKeys(selectedOrders.map(o => o.name));
  };

  const copyFromMenu = useCallback(async (text: string, label: string) => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
      await navigator.clipboard.writeText(text);
      showToast({ message: `Copiado ${label}` });
    } catch {
      showToast({ message: 'No se pudo copiar al portapapeles', tone: 'error' });
    }
  }, [showToast]);

  const contextMenuItems: ContextMenuEntry[] = useMemo(() => {
    if (!contextMenu) return [];
    const { order, expanded, toggleExpanded } = contextMenu;
    const poNumber = order.customer_reference?.trim() || extractOrderNoteMeta(order).poNumber;
    const mine = isMine(order);

    const entries: ContextMenuEntry[] = [
      {
        type: 'item',
        id: 'detail',
        label: 'Ver detalle',
        icon: <Eye aria-hidden="true" />,
        onSelect: () => setDetailOrder(order),
      },
      {
        type: 'item',
        id: 'request',
        label: 'Pedir factura o remisión',
        icon: <FileText aria-hidden="true" />,
        onSelect: () => setQuickRequestOrder(order),
      },
    ];

    if (me) {
      const followed = isFollowedByMe(order);
      const inMyTray = mine || followed;
      const hasOtherOwner = getEngineerName(order) !== null && !mine;
      entries.push({
        type: 'item',
        id: inMyTray ? 'release' : hasOtherOwner ? 'follow' : 'claim',
        label: inMyTray ? 'Soltar' : hasOtherOwner ? 'Seguir en Mis órdenes' : 'Asignármela',
        icon: inMyTray ? <UserMinus aria-hidden="true" /> : <UserCheck aria-hidden="true" />,
        onSelect: () => (inMyTray ? releaseMine([order.name]) : hasOtherOwner ? followForMe([order.name]) : claimForMe([order.name])),
      });
      entries.push({
        type: 'item',
        id: 'assign-engineer',
        label: 'Asignar a ingeniero…',
        icon: <UserPlus aria-hidden="true" />,
        onSelect: () => setAssignDialogKeys([order.name]),
      });
    }

    entries.push({ type: 'separator', id: 'sep-copy' });
    entries.push({
      type: 'item',
      id: 'copy-so',
      label: `Copiar SO (${order.name})`,
      icon: <Copy aria-hidden="true" />,
      onSelect: () => { void copyFromMenu(order.name, `SO ${order.name}`); },
    });

    if (poNumber) {
      entries.push({
        type: 'item',
        id: 'copy-po',
        label: `Copiar PO (${poNumber})`,
        icon: <Copy aria-hidden="true" />,
        onSelect: () => { void copyFromMenu(poNumber, `PO ${poNumber}`); },
      });
    }

    if (toggleExpanded) {
      entries.push({ type: 'separator', id: 'sep-expand' });
      entries.push({
        type: 'item',
        id: 'toggle-expand',
        label: expanded ? 'Contraer fila' : 'Expandir fila',
        icon: expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />,
        onSelect: toggleExpanded,
      });
    }

    return entries;
  }, [contextMenu, isMine, isFollowedByMe, getEngineerName, me, releaseMine, followForMe, claimForMe, copyFromMenu]);

  // ── Export Excel ─────────────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const selectedIds = selectedCount > 0 ? new Set(selectedOrders.map(o => o.id)) : null;
      const { exportOrdersToExcel } = await import('../services/exportExcel');
      exportOrdersToExcel({ orders: filteredOrders, selectedIds, getEngineerName });
    } catch {
      showToast({ message: 'No se pudo generar el archivo de Excel.', tone: 'error' });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
      <div className="min-h-screen bg-background font-sans text-foreground">
        <div className={`mx-auto max-w-[1600px] p-5 lg:p-8 ${selectedCount > 0 ? 'pb-56 md:pb-28' : ''}`}>
          <div className="order-report-no-print space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  {getSection(section).label}
                </h1>
                {freshness && (
                  <p
                    title={freshness.stale ? 'Los datos llevan más de 10 minutos sin actualizarse' : undefined}
                    className={`mt-1 text-sm ${freshness.stale ? 'font-semibold text-warning' : 'text-muted-foreground'}`}
                  >
                    {freshness.stale && (
                      <AlertTriangle className="mr-1.5 inline size-4 align-text-bottom" aria-hidden="true" />
                    )}
                    Actualizado <span className="font-mono-data tabular-nums">{freshness.clock}</span> ({freshness.relative})
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {hasToolbar && (
                  <Button type="button" variant="secondary" className={`${BIG_BUTTON} hidden md:inline-flex`} onClick={handleExport} disabled={filteredOrders.length === 0}>
                    <Download />
                    {selectedCount > 0 ? `Excel (${selectedCount})` : 'Excel'}
                  </Button>
                )}
                <Button type="button" variant="secondary" className={BIG_BUTTON} onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCw className={isFetching ? 'animate-spin text-primary' : ''} />
                  Actualizar
                </Button>
              </div>
            </div>

            {error && !isLoading && (
              <div role="alert" className="flex items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
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
              {hasToolbar && (
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
                    myEngineerId={myEngineerId}
                    myEngineerName={myEngineerName}
                    myOrdersCount={myTrayCount}
                    searchInputRef={searchInputRef}
                    density={density}
                    onToggleDensity={() => {
                      const next = density === 'comfortable' ? 'compact' : 'comfortable';
                      setDensity(next);
                      if (account.loaded) account.update({ appearance: { ...account.settings.appearance, density: next } }).catch(() => undefined);
                    }}
                  />
                  {isMyOrdersFilter && (
                    <MyOrdersSubtabBar
                      subtabs={myOrdersSubtabs}
                      activeSubtab={effectiveMySubtab}
                      onSelectSubtab={setMySubtab}
                    />
                  )}
                </div>
              )}

              {filterEmpty && (
                <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-6 py-12 text-center">
                  <p className="text-base font-semibold text-foreground">Ninguna orden coincide con estos filtros</p>
                  <Button
                    type="button"
                    variant="secondary"
                    className={BIG_BUTTON}
                    onClick={() => {
                      setMySubtab(SUBTAB_ALL);
                      updateFilters({ search: '', client: '', engineer: '', status: 'all' });
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              )}

              {!filterEmpty && activeTab === 'orders' && (
              <div className="mt-5">
                {isLoading ? (
                  <AdminLoadingSkeleton view={view} isMobile={isMobile} />
                ) : view === 'toolcrib' ? (
                  <ToolCribTab
                    orders={filteredOrders}
                    pendingByOrder={pendingByOrder}
                    getEngineerName={getEngineerName}
                    onOrderClick={setDetailOrder}
                    onOrderContextMenu={(e, order) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, order });
                    }}
                    density={density}
                  />
                ) : (
                  <OrdersTable
                    orders={filteredOrders}
                    groupByClient={groupByClient}
                    rowSelection={rowSelection}
                    onRowSelectionChange={setRowSelection}
                    getEngineerName={getEngineerName}
                    isMine={isMine}
                    isFollowedByMe={isFollowedByMe}
                    onClaim={claimForMe}
                    onFollow={followForMe}
                    onOpenAssign={me ? keys => setAssignDialogKeys(keys) : undefined}
                    onRelease={releaseMine}
                    pendingByOrder={pendingByOrder}
                    density={density}
                    onOpenDetail={setDetailOrder}
                    onOrderContextMenu={(e, order, ctx) => {
                      e.preventDefault();
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        order,
                        expanded: ctx.expanded,
                        toggleExpanded: ctx.toggleExpanded,
                      });
                    }}
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
          onRequest={() => {
            setQuickRequestOrder(null);
            setRequestOpen(true);
          }}
          onClaim={claimSelected}
          onAssign={openAssignSelected}
          claimDisabled={!me}
          onExport={handleExport}
          onClear={() => setRowSelection({})}
        />

        <AssignEngineerDialog
          open={isAssignDialogOpen}
          orderKeys={assignDialogKeys ?? []}
          engineers={team.engineers}
          myEngineerId={myEngineerId}
          myEngineerName={myEngineerName}
          currentEngineerId={assignCurrentEngineerId}
          onAssign={(keys, target, label) => {
            assignToEngineer(keys, target, label);
            if (selectedCount > 0) setRowSelection({});
          }}
          onClose={() => setAssignDialogKeys(null)}
        />

        <RequestDialog
          orders={dialogOrders}
          open={isRequestDialogOpen}
          onClose={() => {
            setQuickRequestOrder(null);
            setRequestOpen(false);
          }}
          onSent={() => {
            if (!quickRequestOrder) setRowSelection({});
          }}
        />

        {activeDetailOrder && (
          <Suspense fallback={null}>
            <OrderDetailsModal
              order={activeDetailOrder}
              isOpen
              onClose={() => setDetailOrder(null)}
            />
          </Suspense>
        )}

        <ContextMenu
          open={contextMenu !== null}
          x={contextMenu?.x ?? 0}
          y={contextMenu?.y ?? 0}
          ariaLabel={contextMenu ? `Acciones para ${contextMenu.order.name}` : 'Acciones de orden'}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />

        <div
          role="region"
          aria-label="Notificaciones de órdenes"
          className={`fixed right-4 z-[65] max-w-[calc(100vw-2rem)] ${
            selectedCount > 0 ? 'bottom-36 md:bottom-24' : 'bottom-20 md:bottom-6'
          }`}
        >
          {toast && (
            <div
              key={toast.id}
              role="status"
              aria-live="polite"
              onMouseEnter={pauseToastTimer}
              onMouseLeave={resumeToastTimer}
              onFocus={pauseToastTimer}
              onBlur={resumeToastTimer}
              className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-overlay ${
                toast.tone === 'error'
                  ? 'border-destructive/40 bg-popover text-destructive'
                  : 'border-border bg-popover text-popover-foreground'
              }`}
            >
              <span className="font-medium">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="cursor-pointer rounded-lg bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                onClick={dismissToast}
                aria-label="Cerrar aviso"
                title="Cerrar aviso"
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>
  );
}
