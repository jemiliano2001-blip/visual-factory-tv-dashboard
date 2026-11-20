/**
 * Barra de controles del Admin en una sola fila (escritorio) o buscador + "Filtros" (móvil).
 * Recibe y emite el mismo AdminFilters que vive en el link; no tiene lógica de datos propia.
 */
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  Check, Download, Filter, Link2, MoreHorizontal, Printer, Rows3, UserCheck, Users2, X,
} from 'lucide-react';
import { UNASSIGNED_ENGINEER, type AdminFilters } from '../../services/adminFilters';
import { activeFilterChips, clearFilter, hasActiveFilters } from '../../services/adminSections';
import { useMobile } from '../../hooks/useMobile';
import { Button } from '../ui/button';
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle,
} from '../ui/drawer';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { ClientSelect, OrderSearchInput, STATUS_OPTIONS, StatusSelect } from './OrdersFilterBar';

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
  const [linkCopied, setLinkCopied] = useState(false);
  const copyTimerRef = useRef<number | null>(null);

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
          className={isMobile ? 'min-w-0' : 'min-w-[220px]'}
        />
        {!isMobile && (
          <>
            {myOrdersButton}
            <ClientSelect value={filters.client} onChange={client => onChange({ client })} clients={p.clients} className="min-h-11 w-[195px]" />
            <StatusSelect value={filters.status} onChange={status => onChange({ status })} className="min-h-11 w-[185px]" />
            {engineerSelect}
            {excelButton}
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
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Más acciones"
              className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-input bg-secondary text-secondary-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <MoreHorizontal className="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>{menuItems}</DropdownMenuContent>
          </DropdownMenu>
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
    </search>
  );
}
