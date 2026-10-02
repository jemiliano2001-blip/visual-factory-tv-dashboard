/**
 * Barra de control flotante para la TV. Aparece solo cuando el mouse se acerca
 * a su zona (arriba-centro) y se oculta apenas se aleja — en la tele de pared,
 * sin mouse, nunca aparece. Deja a los ingenieros filtrar al instante por
 * cliente / estado / texto y pausar la rotación.
 *
 * En móvil: siempre visible, layout compacto full-width con búsqueda inline
 * y selector de cliente expandible.
 */
import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Pause, Play, X, SlidersHorizontal, ChevronUp } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui/select';
import { useProximityVisible } from '../hooks/useProximityVisible';
import { getSmartCompanyName } from '../utils/customerNames';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from './ui/drawer';

const ALL_CLIENTS = '__all__';

export type StatusFilter = 'all' | 'overdue' | 'pending' | 'delivered' | 'critical';

const STATUS_OPTIONS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos los estados' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'critical', label: 'Críticas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'delivered', label: 'Entregadas' },
];

interface TVControlBarProps {
  isTVMode: boolean;
  isMobile?: boolean;
  clients: string[];
  clientFilter: string | null;
  onClient: (client: string | null) => void;
  statusFilter: StatusFilter;
  onStatus: (status: StatusFilter) => void;
  textFilter: string;
  onText: (text: string) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
}

const TVControlBar: React.FC<TVControlBarProps> = ({
  isTVMode, isMobile = false, clients, clientFilter, onClient, statusFilter, onStatus, textFilter, onText, isPaused, onTogglePause, onClear,
}) => {
  const [anchorRef, near] = useProximityVisible<HTMLDivElement>(100, 250, 4000);
  const [hovering, setHovering] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const hasFilters = Boolean(clientFilter || textFilter || isPaused || statusFilter !== 'all');

  // Los hooks van antes del return de móvil: su orden no puede cambiar entre renders.
  // Visible mientras el cursor esté cerca, encima de la barra o con un menú
  // abierto. El foco NO la fija: antes, tras usar el buscador o "Pausar" la barra
  // se quedaba pegada hasta hacer clic en otra parte.
  const visible = isTVMode ? (near || hovering || menuOpen) : true;

  // Al ocultarse se suelta el foco, para que un campo invisible no capture teclas.
  useEffect(() => {
    if (!isTVMode || visible) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && anchorRef.current?.contains(active)) active.blur();
  }, [isTVMode, visible, anchorRef]);


  // ── Móvil: barra de búsqueda compacta siempre visible ─────────────────────────
  if (isMobile) {
    return (
      <div className="mb-3">
        <div className="glass-panel rounded-2xl px-3 py-2.5 shadow-overlay">
          <div className="flex items-center gap-2">
            {/* Search input — always visible */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                aria-label="Buscar SO, PO, OT, ingeniero, producto o cliente"
                value={textFilter}
                onChange={(e) => onText(e.target.value)}
                placeholder="SO, PO, OT o ingeniero…"
                className="h-10 pl-9 bg-transparent border-border focus-visible:border-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Filter button — opens Drawer */}
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(true)}
              title="Filtros"
              aria-label="Filtros"
              className={`relative h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                clientFilter || statusFilter !== 'all'
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'border-input text-muted-foreground/60 hover:border-white/20 hover:text-muted-foreground'
              }`}
            >
              <SlidersHorizontal className="size-4" />
              {(clientFilter || statusFilter !== 'all') && (
                <span className="absolute -right-1 -top-1 size-2 rounded-full bg-primary ring-2 ring-background" />
              )}
            </button>

            {/* Clear button */}
            {hasFilters && (
              <button
                type="button"
                onClick={onClear}
                title="Limpiar filtros"
                aria-label="Limpiar filtros"
                className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-input text-muted-foreground/60 transition-colors hover:border-red-500/40 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Client filter Drawer */}
        <Drawer open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
          <DrawerContent className="bg-popover/95 border-border">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm font-bold uppercase tracking-wider text-secondary-foreground">
                Filtros
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-8 space-y-1 overflow-y-auto no-scrollbar max-h-[60dvh]">
              <p className="px-1 pt-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Estado</p>
              <div className="flex flex-wrap gap-2 pb-3">
                {STATUS_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onStatus(value)}
                    className={`min-h-[44px] px-4 rounded-xl text-sm font-medium border transition-colors ${
                      statusFilter === value
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'border-input text-secondary-foreground hover:bg-white/5'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Cliente</p>
              {[null, ...clients].map((c) => (
                <button
                  key={c ?? '__all__'}
                  type="button"
                  onClick={() => {
                    onClient(c);
                    setFilterDrawerOpen(false);
                  }}
                  className={`w-full min-h-[44px] px-4 py-3 rounded-xl text-left text-sm font-medium transition-colors ${
                    (clientFilter ?? null) === c
                      ? 'bg-primary/15 text-primary border border-primary/30'
                      : 'text-secondary-foreground hover:bg-white/5'
                  }`}
                >
                  {c ? getSmartCompanyName(c, 'header') : 'Todas las empresas'}
                </button>
              ))}
            </div>
          </DrawerContent>
        </Drawer>
      </div>
    );
  }

  // ── Escritorio / TV: barra flotante por proximidad ─────────────────────────────
  const handleDismiss = () => {
    setHovering(false);
    setMenuOpen(false);
  };

  return (
    <div
      ref={isTVMode ? anchorRef : undefined}
      // En TV el contenedor tiene tamaño FIJO (aunque la barra esté oculta) para que
      // la zona de aproximación no se encoja ni cambie mientras se anima; no captura
      // clics (pointer-events-none), solo la barra en sí.
      className={isTVMode
        ? "pointer-events-none absolute left-1/2 top-1 z-50 flex h-[60px] w-[1100px] max-w-[96vw] -translate-x-1/2 justify-center"
        : "flex w-full justify-center py-2 mb-4 pointer-events-none"
      }
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto"
            onPointerEnter={() => setHovering(true)}
            onPointerLeave={() => setHovering(false)}
          >
            <div className="glass-panel flex items-center gap-2 rounded-2xl px-3 py-2 shadow-overlay border border-input bg-popover/90 backdrop-blur-xl">
              <SlidersHorizontal className="ml-1 size-4 shrink-0 text-cyan-400" />

              <Select
                value={clientFilter ?? ALL_CLIENTS}
                onValueChange={(v) => onClient(v === ALL_CLIENTS ? null : v)}
                onOpenChange={setMenuOpen}
              >
                <SelectTrigger aria-label="Filtrar por cliente" className="h-10 w-[210px] text-xs font-semibold border-input bg-black/40">
                  <SelectValue placeholder="Todas las empresas">
                    {clientFilter ? getSmartCompanyName(clientFilter, 'header') : 'Todas las empresas'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[50vh] overflow-y-auto">
                  <SelectItem value={ALL_CLIENTS}>Todas las empresas</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c} value={c}>
                      {getSmartCompanyName(c, 'header')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(v) => onStatus(v as StatusFilter)}
                onOpenChange={setMenuOpen}
              >
                <SelectTrigger aria-label="Filtrar por estado" className="h-10 w-[170px] text-xs font-semibold border-input bg-black/40">
                  <SelectValue>
                    {STATUS_OPTIONS.find(o => o.value === statusFilter)?.label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar SO, PO, OT, ingeniero, producto o cliente"
                  value={textFilter}
                  onChange={(e) => onText(e.target.value)}
                  placeholder="SO, PO, OT o ingeniero…"
                  className="h-10 w-[260px] pl-9 text-xs border-input bg-black/40"
                />
              </div>

              <Button
                type="button"
                variant={isPaused ? 'default' : 'secondary'}
                size="sm"
                className="h-10 text-xs font-semibold gap-1.5"
                onClick={onTogglePause}
                title={isPaused ? 'Reanudar rotación automática' : 'Pausar rotación automática'}
              >
                {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                {isPaused ? 'Reanudar' : 'Pausar'}
              </Button>

              {hasFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-10 text-xs text-red-300 hover:bg-red-500/20 hover:text-red-200"
                  onClick={onClear}
                  title="Limpiar filtros"
                >
                  <X className="size-3.5 mr-1" /> Limpiar
                </Button>
              )}

              {isTVMode && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 rounded-lg text-muted-foreground hover:text-foreground ml-1"
                  onClick={handleDismiss}
                  title="Ocultar barra"
                >
                  <ChevronUp className="size-4" />
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TVControlBar;
