/**
 * Barra de controles del Admin en una sola fila (escritorio) o buscador + "Filtros" (móvil).
 * Recibe y emite el mismo AdminFilters que vive en el link; no tiene lógica de datos propia.
 */
import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import type { VisibilityState } from '@tanstack/react-table';
import {
  Bookmark, Check, Columns3, Download, Filter, Link2, MoreHorizontal, Plus, Printer, RotateCcw, Rows3, Trash2, UserCheck, Users2, X,
} from 'lucide-react';
import { UNASSIGNED_ENGINEER, type AdminFilters } from '../../services/adminFilters';
import { activeFilterChips, clearFilter, hasActiveFilters } from '../../services/adminSections';
import { MAX_SAVED_VIEW_NAME, type SavedAdminView } from '../../services/savedViews';
import { useMobile } from '../../hooks/useMobile';
import { Button } from '../ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../ui/dialog';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '../ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ClientSelect, OrderSearchInput, STATUS_OPTIONS, StatusSelect } from './OrdersFilterBar';
import { TOGGLEABLE_ORDER_COLUMNS } from './OrdersTable';

const ALL_ENGINEERS = '__all__';
const CONTROL = 'min-h-11 px-4 text-sm font-semibold rounded-xl';

export type TableDensity = 'comfortable' | 'compact';

export interface ToolbarEngineer { id: string; name: string; count: number }

export interface AdminToolbarProps {
  filters: AdminFilters;
  onChange: (patch: Partial<AdminFilters>) => void;
  clients: string[];
  engineers: ToolbarEngineer[];
  totalCount: number;
  unassignedCount: number;
  shownCount: number;
  showGroupToggle: boolean;
  groupByClient: boolean;
  onToggleGroup: () => void;
  onExport: () => void;
  exportLabel: string;
  exportDisabled: boolean;
  myEngineerId?: string | null;
  myEngineerName?: string | null;
  myOrdersCount?: number;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  density?: TableDensity;
  onToggleDensity?: () => void;
  savedViews?: SavedAdminView[];
  onSaveView?: (name: string) => void;
  onApplyView?: (view: SavedAdminView) => void;
  onDeleteView?: (id: string) => void;
  columnVisibility?: VisibilityState;
  onToggleColumn?: (columnId: string) => void;
  onResetColumns?: () => void;
}

/** <select> nativo: los popups de Select/Menu se pintan bajo el Drawer (z-[70]) en móvil. */
function NativeSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: ReadonlyArray<{ value: string; label: string }> }) {
  const known = options.some(o => o.value === value);
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-input bg-background/40 px-3.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
      >
        {!known && <option value={value}>{value}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export default function AdminToolbar(p: AdminToolbarProps) {
  const { filters, onChange } = p;
  const isMobile = useMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [saveViewOpen, setSaveViewOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const viewInputId = useId();

  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  const resolveEngineerName = (id: string) =>
    p.engineers.find(e => e.id === id)?.name ??
    (p.myEngineerId && id === p.myEngineerId ? (p.myEngineerName ?? 'Mis órdenes') : null);

  const chips = activeFilterChips(filters, {
    engineerName: resolveEngineerName,
    statusLabel: s => STATUS_OPTIONS.find(o => o.value === s)?.label ?? s,
  });
  const drawerFilterCount = chips.filter(c => c.key !== 'search').length;
  const isMyOrdersActive = Boolean(p.myEngineerId && filters.engineer === p.myEngineerId);
  const toggleMyOrders = () => {
    if (!p.myEngineerId) return;
    onChange({ engineer: isMyOrdersActive ? '' : p.myEngineerId });
  };
  const engineerOptionsList =
    p.myEngineerId && !p.engineers.some(e => e.id === p.myEngineerId)
      ? [{ id: p.myEngineerId, name: p.myEngineerName ?? 'Mis órdenes', count: p.myOrdersCount ?? 0 }, ...p.engineers]
      : p.engineers;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => {
        copyTimerRef.current = null;
        setLinkCopied(false);
      }, 2000);
    } catch {
      // portapapeles no disponible: la URL ya está en la barra
    }
  };

  const myOrdersButton = p.myEngineerId ? (
    <Button
      type="button"
      variant={isMyOrdersActive ? 'default' : 'secondary'}
      aria-pressed={isMyOrdersActive}
      className={CONTROL}
      onClick={toggleMyOrders}
    >
      <UserCheck className="size-4" aria-hidden="true" />
      Mis órdenes (<span className="font-mono-data tabular-nums">{p.myOrdersCount ?? 0}</span>)
    </Button>
  ) : null;

  const engineerSelect = (
    <Select
      value={filters.engineer || ALL_ENGINEERS}
      onValueChange={v => onChange({ engineer: v && v !== ALL_ENGINEERS ? v : '' })}
    >
      <SelectTrigger aria-label="Filtrar por diseñador o ingeniero" className="min-h-11 md:w-[220px]">
        <SelectValue>
          {filters.engineer === UNASSIGNED_ENGINEER
            ? `Sin asignar (${p.unassignedCount})`
            : filters.engineer
              ? (() => {
                  const e = engineerOptionsList.find(x => x.id === filters.engineer);
                  return e ? `${e.name} (${e.count})` : (resolveEngineerName(filters.engineer) ?? 'Ingeniero desconocido');
                })()
              : `Todos los ingenieros (${p.totalCount})`}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[50vh] overflow-y-auto">
        <SelectItem value={ALL_ENGINEERS}>Todos los ingenieros ({p.totalCount})</SelectItem>
        {engineerOptionsList.map(e => <SelectItem key={e.id} value={e.id}>{e.name} ({e.count})</SelectItem>)}
        <SelectItem value={UNASSIGNED_ENGINEER}>Sin asignar ({p.unassignedCount})</SelectItem>
      </SelectContent>
    </Select>
  );

  const excelButton = (
    <Button type="button" variant="secondary" className={CONTROL} onClick={p.onExport} disabled={p.exportDisabled}>
      <Download /> {p.exportLabel}
    </Button>
  );

  const densityLabel = p.density === 'compact' ? 'Densidad cómoda' : 'Densidad compacta';
  const savedViews = p.savedViews ?? [];
  const toggleableColumns = TOGGLEABLE_ORDER_COLUMNS.filter(
    c => !(p.groupByClient && c.id === 'partner_name'),
  );
  const hiddenColumnsCount = toggleableColumns.filter(c => p.columnVisibility?.[c.id] === false).length;

  const submitSaveView = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const clean = viewName.trim();
    if (!clean || !p.onSaveView) return;
    p.onSaveView(clean);
    setViewName('');
    setSaveViewOpen(false);
  };

  const viewsDropdown = p.onSaveView && p.onApplyView ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Vistas guardadas"
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-input bg-secondary px-3 text-sm font-semibold text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Bookmark className="size-4" aria-hidden="true" />
        <span>Vistas{savedViews.length > 0 ? ` (${savedViews.length})` : ''}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64">
        {savedViews.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            Sin vistas guardadas todavía
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto">
            {savedViews.map(v => (
              <div key={v.id} className="flex items-center gap-1">
                <DropdownMenuItem
                  className="min-w-0 flex-1"
                  onClick={() => p.onApplyView?.(v)}
                >
                  <span className="truncate">{v.name}</span>
                </DropdownMenuItem>
                {p.onDeleteView && (
                  <button
                    type="button"
                    aria-label={`Eliminar vista ${v.name}`}
                    title={`Eliminar vista ${v.name}`}
                    onClick={e => {
                      e.stopPropagation();
                      p.onDeleteView?.(v.id);
                    }}
                    className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="my-1 border-t border-border" />
        <DropdownMenuItem
          onClick={() => {
            setViewName('');
            setSaveViewOpen(true);
          }}
        >
          <Plus aria-hidden="true" /> Guardar vista actual…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const columnsDropdown = p.showGroupToggle && p.onToggleColumn ? (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Columnas visibles"
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-input bg-secondary px-3 text-sm font-semibold text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Columns3 className="size-4" aria-hidden="true" />
        <span>Columnas{hiddenColumnsCount > 0 ? ` (${toggleableColumns.length - hiddenColumnsCount}/${toggleableColumns.length})` : ''}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        {toggleableColumns.map(col => {
          const visible = p.columnVisibility?.[col.id] !== false;
          return (
            <DropdownMenuItem
              key={col.id}
              closeOnClick={false}
              onClick={() => p.onToggleColumn?.(col.id)}
            >
              <Check className={visible ? 'text-primary opacity-100' : 'opacity-0'} aria-hidden="true" />
              <span>{col.label}</span>
            </DropdownMenuItem>
          );
        })}
        {hiddenColumnsCount > 0 && p.onResetColumns && (
          <>
            <div className="my-1 border-t border-border" />
            <DropdownMenuItem onClick={p.onResetColumns}>
              <RotateCcw aria-hidden="true" /> Restablecer columnas
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null;

  const menuItems = (
    <>
      <DropdownMenuItem onClick={copyLink}>
        {linkCopied ? <Check className="text-success" /> : <Link2 />}
        {linkCopied ? 'Link copiado' : 'Copiar link'}
      </DropdownMenuItem>
      {p.showGroupToggle && (
        <DropdownMenuItem onClick={p.onToggleGroup}>
          <Users2 /> {p.groupByClient ? 'Lista plana' : 'Agrupar por compañía'}
        </DropdownMenuItem>
      )}
      {p.onToggleDensity && (
        <DropdownMenuItem onClick={p.onToggleDensity}>
          <Rows3 /> {densityLabel}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={() => window.print()} disabled={p.shownCount === 0}>
        <Printer /> Imprimir / PDF
      </DropdownMenuItem>
    </>
  );

  return (
    <search aria-label="Filtrar órdenes" className="block space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <OrderSearchInput
          value={filters.search}
          onChange={search => onChange({ search })}
          inputRef={p.searchInputRef}
          className={isMobile ? 'min-w-0' : 'min-w-[200px]'}
        />
        {!isMobile && (
          <>
            {myOrdersButton}
            <ClientSelect value={filters.client} onChange={client => onChange({ client })} clients={p.clients} className="min-h-11 w-[195px]" />
            <StatusSelect value={filters.status} onChange={status => onChange({ status })} className="min-h-11 w-[185px]" />
            {engineerSelect}
          </>
        )}
        {isMobile ? (
          <>
            {myOrdersButton}
            <Button type="button" variant="secondary" className={CONTROL} onClick={() => setFiltersOpen(true)}>
              <Filter /> Filtros{drawerFilterCount > 0 ? ` (${drawerFilterCount})` : ''}
            </Button>
          </>
        ) : (
          <>
            {viewsDropdown}
            {columnsDropdown}
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Más acciones"
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-input bg-secondary text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <MoreHorizontal className="size-5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent>{menuItems}</DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          <span className="font-mono-data font-semibold tabular-nums text-foreground">{p.shownCount}</span> de{' '}
          <span className="font-mono-data tabular-nums">{p.totalCount}</span> órdenes
        </p>
        {chips.map(chip => (
          <button
            key={chip.key}
            type="button"
            aria-label={`Quitar filtro ${chip.label}`}
            onClick={() => onChange(clearFilter(filters, chip.key))}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 md:min-h-8 rounded-lg border border-border bg-secondary px-2.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-accent"
          >
            {chip.label}
            <X className="size-3.5" />
          </button>
        ))}
        {hasActiveFilters(filters) && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 px-2 text-xs font-semibold md:min-h-8"
            onClick={() => onChange({ search: '', client: '', engineer: '', status: 'all' })}
          >
            Limpiar
          </Button>
        )}
      </div>

      {isMobile && (
        <Drawer open={filtersOpen} onOpenChange={setFiltersOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>Filtros</DrawerTitle>
            </DrawerHeader>
            <div className="space-y-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <NativeSelect
                label="Cliente"
                value={filters.client}
                onChange={client => onChange({ client })}
                options={[{ value: '', label: 'Todos los clientes' }, ...p.clients.map(c => ({ value: c, label: c }))]}
              />
              <NativeSelect
                label="Estado"
                value={filters.status}
                onChange={v => onChange({ status: v as AdminFilters['status'] })}
                options={STATUS_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
              />
              <NativeSelect
                label="Ingeniero"
                value={filters.engineer}
                onChange={engineer => onChange({ engineer })}
                options={[
                  { value: '', label: `Todos los ingenieros (${p.totalCount})` },
                  ...engineerOptionsList.map(e => ({ value: e.id, label: `${e.name} (${e.count})` })),
                  { value: UNASSIGNED_ENGINEER, label: `Sin asignar (${p.unassignedCount})` },
                ]}
              />
              <div className="border-t border-border pt-3">
                <div className="flex flex-col gap-2 [&>button]:w-full">
                  {excelButton}
                  {p.onSaveView && p.onApplyView && (
                    <div className="space-y-2 rounded-xl border border-border bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Vistas guardadas</span>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-8 px-2 text-xs font-semibold text-primary"
                          onClick={() => {
                            setFiltersOpen(false);
                            setViewName('');
                            setSaveViewOpen(true);
                          }}
                        >
                          <Plus className="size-3.5" aria-hidden="true" /> Guardar actual
                        </Button>
                      </div>
                      {savedViews.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Sin vistas guardadas todavía.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {savedViews.map(v => (
                            <div key={v.id} className="inline-flex items-center rounded-lg border border-border bg-secondary">
                              <button
                                type="button"
                                onClick={() => {
                                  p.onApplyView?.(v);
                                  setFiltersOpen(false);
                                }}
                                className="min-h-9 cursor-pointer px-2.5 text-xs font-medium text-secondary-foreground hover:text-foreground"
                              >
                                {v.name}
                              </button>
                              {p.onDeleteView && (
                                <button
                                  type="button"
                                  aria-label={`Eliminar vista ${v.name}`}
                                  onClick={() => p.onDeleteView?.(v.id)}
                                  className="min-h-9 cursor-pointer px-2 text-muted-foreground hover:text-destructive"
                                >
                                  <X className="size-3.5" aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  <Button type="button" variant="secondary" className={CONTROL} onClick={copyLink}>
                    {linkCopied ? <Check className="text-success" /> : <Link2 />} {linkCopied ? 'Link copiado' : 'Copiar link'}
                  </Button>
                  {p.showGroupToggle && (
                    <Button type="button" variant="secondary" className={CONTROL} onClick={p.onToggleGroup}>
                      <Users2 /> {p.groupByClient ? 'Lista plana' : 'Agrupar por compañía'}
                    </Button>
                  )}
                  {p.onToggleDensity && (
                    <Button type="button" variant="secondary" className={CONTROL} onClick={p.onToggleDensity}>
                      <Rows3 /> {densityLabel}
                    </Button>
                  )}
                  <Button type="button" variant="secondary" className={CONTROL} onClick={() => window.print()} disabled={p.shownCount === 0}>
                    <Printer /> Imprimir / PDF
                  </Button>
                </div>
              </div>
              <Button type="button" className={`${CONTROL} w-full`} onClick={() => setFiltersOpen(false)}>
                Ver {p.shownCount} {p.shownCount === 1 ? 'orden' : 'órdenes'}
              </Button>
            </div>
          </DrawerContent>
        </Drawer>
      )}
      {saveViewOpen && (
        <Dialog open={saveViewOpen} onOpenChange={setSaveViewOpen}>
          <DialogContent className="print:hidden max-w-md">
            <DialogHeader>
              <DialogTitle>Guardar vista de filtros</DialogTitle>
              <DialogDescription>
                Guarda la sección y los filtros actuales en este navegador para volver con un clic.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submitSaveView} className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor={viewInputId} className="text-xs font-medium text-muted-foreground">
                  Nombre de la vista
                </label>
                <Input
                  id={viewInputId}
                  autoFocus
                  maxLength={MAX_SAVED_VIEW_NAME}
                  value={viewName}
                  onChange={e => setViewName(e.target.value)}
                  placeholder="Ej. Atrasadas Bosch"
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setSaveViewOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={viewName.trim().length === 0}>
                  Guardar vista
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </search>
  );
}
