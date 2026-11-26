import { useId, useMemo, useState } from 'react';
import {
  BarChart3,
  Download,
  Keyboard,
  LayoutGrid,
  RefreshCw,
  Rows3,
  Search,
  Settings,
  Tv,
  Wrench,
  FileText,
  X,
} from 'lucide-react';
import type { OdooSaleOrder } from '../../services/odoo';
import { createOrderSearchMatcher } from '../../services/orderSearch';
import { extractOrderNoteMeta } from '../../services/orderNoteParser';
import type { AdminSectionId } from '../../services/adminSections';
import { getSmartCompanyName } from '../../utils/customerNames';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { TableDensity } from './AdminToolbar';

interface PaletteItem {
  id: string;
  group: 'Órdenes' | 'Navegación' | 'Acciones';
  label: string;
  hint?: string;
  icon: 'order' | 'company' | 'toolcrib' | 'requests' | 'config' | 'stats' | 'tv' | 'refresh' | 'export' | 'clear' | 'density' | 'shortcuts';
  keywords: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: OdooSaleOrder[];
  onSelectSection: (sectionId: AdminSectionId) => void;
  onNavigateRoute: (path: '/' | '/stats') => void;
  onSelectOrder: (order: OdooSaleOrder) => void;
  onRefresh: () => void;
  onExport: () => void;
  onClearFilters: () => void;
  hasActiveFilters: boolean;
  onToggleDensity: () => void;
  density: TableDensity;
  onOpenShortcuts: () => void;
}

function renderIcon(kind: PaletteItem['icon']) {
  const cls = 'size-4 shrink-0 text-muted-foreground';
  switch (kind) {
    case 'order': return <Search className={cls} aria-hidden="true" />;
    case 'company': return <LayoutGrid className={cls} aria-hidden="true" />;
    case 'toolcrib': return <Wrench className={cls} aria-hidden="true" />;
    case 'requests': return <FileText className={cls} aria-hidden="true" />;
    case 'config': return <Settings className={cls} aria-hidden="true" />;
    case 'stats': return <BarChart3 className={cls} aria-hidden="true" />;
    case 'tv': return <Tv className={cls} aria-hidden="true" />;
    case 'refresh': return <RefreshCw className={cls} aria-hidden="true" />;
    case 'export': return <Download className={cls} aria-hidden="true" />;
    case 'clear': return <X className={cls} aria-hidden="true" />;
    case 'density': return <Rows3 className={cls} aria-hidden="true" />;
    case 'shortcuts': return <Keyboard className={cls} aria-hidden="true" />;
  }
}

export default function CommandPalette({
  open,
  onOpenChange,
  orders,
  onSelectSection,
  onNavigateRoute,
  onSelectOrder,
  onRefresh,
  onExport,
  onClearFilters,
  hasActiveFilters,
  onToggleDensity,
  density,
  onOpenShortcuts,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputId = useId();
  const listboxId = useId();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setActiveIndex(0);
    }
    onOpenChange(next);
  };

  const items = useMemo<PaletteItem[]>(() => {
    const trimmed = query.trim();
    const qLower = trimmed.toLowerCase();
    const closeAnd = (fn: () => void) => () => {
      handleOpenChange(false);
      fn();
    };

    const navItems: PaletteItem[] = [
      { id: 'nav-company', group: 'Navegación', label: 'Órdenes por compañía', hint: 'Admin', icon: 'company', keywords: 'ordenes compania tabla inicio', run: closeAnd(() => onSelectSection('company')) },
      { id: 'nav-toolcrib', group: 'Navegación', label: 'Tool Crib', hint: 'Planos y OT', icon: 'toolcrib', keywords: 'tool crib planos ot impresion', run: closeAnd(() => onSelectSection('toolcrib')) },
      { id: 'nav-requests', group: 'Navegación', label: 'Solicitudes de factura o remisión', hint: 'Admin', icon: 'requests', keywords: 'solicitudes factura remision', run: closeAnd(() => onSelectSection('requests')) },
      { id: 'nav-config', group: 'Navegación', label: 'Configuración de horarios', hint: 'Admin', icon: 'config', keywords: 'configuracion horarios acceso', run: closeAnd(() => onSelectSection('config')) },
      { id: 'nav-stats', group: 'Navegación', label: 'Estadísticas', hint: '/stats', icon: 'stats', keywords: 'estadisticas graficas reportes', run: closeAnd(() => onNavigateRoute('/stats')) },
      { id: 'nav-tv', group: 'Navegación', label: 'TV Dashboard en vivo', hint: '/', icon: 'tv', keywords: 'tv pantalla planta vivo', run: closeAnd(() => onNavigateRoute('/')) },
    ];

    const actionItems: PaletteItem[] = [
      { id: 'act-refresh', group: 'Acciones', label: 'Actualizar órdenes desde Odoo', icon: 'refresh', keywords: 'refrescar recargar actualizar odoo', run: closeAnd(onRefresh) },
      { id: 'act-export', group: 'Acciones', label: 'Exportar tabla a Excel', icon: 'export', keywords: 'excel exportar descargar xlsx', run: closeAnd(onExport) },
      ...(hasActiveFilters
        ? [{ id: 'act-clear', group: 'Acciones' as const, label: 'Limpiar filtros activos', icon: 'clear' as const, keywords: 'limpiar filtros quitar reiniciar', run: closeAnd(onClearFilters) }]
        : []),
      {
        id: 'act-density',
        group: 'Acciones',
        label: density === 'compact' ? 'Cambiar a densidad cómoda' : 'Cambiar a densidad compacta',
        icon: 'density',
        keywords: 'densidad tabla compacta comoda filas',
        run: closeAnd(onToggleDensity),
      },
      { id: 'act-shortcuts', group: 'Acciones', label: 'Ver atajos de teclado', hint: '?', icon: 'shortcuts', keywords: 'atajos teclado ayuda', run: closeAnd(onOpenShortcuts) },
    ];

    const orderItems: PaletteItem[] = [];
    if (trimmed.length > 0) {
      const matcher = createOrderSearchMatcher(trimmed);
      for (const order of orders) {
        if (!matcher(order)) continue;
        const { poNumber } = extractOrderNoteMeta(order);
        const company = getSmartCompanyName(order.partner_name, 'card');
        orderItems.push({
          id: `ord-${order.id}`,
          group: 'Órdenes',
          label: `${order.name}${poNumber ? ` · PO.${poNumber}` : ''}`,
          hint: `${company} — ${order.main_product}`,
          icon: 'order',
          keywords: `${order.name} ${company}`,
          run: closeAnd(() => onSelectOrder(order)),
        });
        if (orderItems.length >= 8) break;
      }
    }

    const matchesText = (item: PaletteItem) =>
      !qLower || item.label.toLowerCase().includes(qLower) || item.keywords.toLowerCase().includes(qLower);

    return [
      ...orderItems,
      ...navItems.filter(matchesText),
      ...actionItems.filter(matchesText),
    ];
  }, [
    query,
    orders,
    hasActiveFilters,
    density,
    onSelectSection,
    onNavigateRoute,
    onSelectOrder,
    onRefresh,
    onExport,
    onClearFilters,
    onToggleDensity,
    onOpenShortcuts,
  ]);

  const safeIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : -1;
  const activeOptionId = safeIndex >= 0 ? `${listboxId}-opt-${items[safeIndex].id}` : undefined;

  const grouped = useMemo(() => {
    const groups: Array<{ title: PaletteItem['group']; entries: Array<{ item: PaletteItem; index: number }> }> = [];
    const byName = new Map<PaletteItem['group'], Array<{ item: PaletteItem; index: number }>>();
    items.forEach((item, index) => {
      const list = byName.get(item.group) ?? [];
      list.push({ item, index });
      byName.set(item.group, list);
    });
    for (const [title, entries] of byName) {
      groups.push({ title, entries });
    }
    return groups;
  }, [items]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % items.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + items.length) % items.length);
      return;
    }
    if (e.key === 'Enter') {
      // Guarda IME obligatoria (Chrome/Safari) para no ejecutar mientras se compone texto.
      if (e.nativeEvent.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      if (safeIndex >= 0) items[safeIndex].run();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false} className="print:hidden max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Paleta de comandos</DialogTitle>
          <DialogDescription>Busca órdenes, secciones y acciones rápidas.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor={inputId} className="sr-only">Buscar comando, sección u orden</label>
          <input
            id={inputId}
            type="text"
            autoFocus
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded={true}
            aria-controls={listboxId}
            aria-activedescendant={activeOptionId}
            placeholder="Buscar SO, PO, cliente, vista o acción…"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => handleOpenChange(false)}
            aria-label="Cerrar paleta de comandos"
            className="shrink-0 cursor-pointer rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono-data text-[11px] text-muted-foreground hover:text-foreground"
          >
            Esc
          </button>
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label="Resultados de comandos"
          className="max-h-[60vh] overflow-y-auto p-2"
        >
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              Sin coincidencias para &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            grouped.map(group => (
              <div key={group.title} className="mb-2 last:mb-0">
                <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                  {group.title}
                </div>
                {group.entries.map(({ item, index }) => {
                  const isActive = index === safeIndex;
                  return (
                    <button
                      key={item.id}
                      id={`${listboxId}-opt-${item.id}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={item.run}
                      className={`flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isActive ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60'
                      }`}
                    >
                      {renderIcon(item.icon)}
                      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                      {item.hint && (
                        <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">
                          {item.hint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
