/**
 * Barra de control flotante para la TV. Aparece solo cuando el mouse se acerca
 * a su zona (arriba-centro) y se oculta apenas se aleja — en la tele de pared,
 * sin mouse, nunca aparece. Deja a los ingenieros filtrar al instante por
 * cliente / texto y pausar la rotación, sin usar voz.
 *
 * En móvil: siempre visible, layout compacto full-width con búsqueda inline
 * y selector de cliente expandible.
 */
import React, { useState } from 'react';
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

interface TVControlBarProps {
  isTVMode: boolean;
  isMobile?: boolean;
  clients: string[];
  clientFilter: string | null;
  onClient: (client: string | null) => void;
  textFilter: string;
  onText: (text: string) => void;
  isPaused: boolean;
  onTogglePause: () => void;
  onClear: () => void;
}

const TVControlBar: React.FC<TVControlBarProps> = ({
  isTVMode, isMobile = false, clients, clientFilter, onClient, textFilter, onText, isPaused, onTogglePause, onClear,
}) => {
  const [anchorRef, near] = useProximityVisible<HTMLDivElement>(100, 250, 4000);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);

  const hasFilters = Boolean(clientFilter || textFilter || isPaused);

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
                aria-label="Buscar orden, producto o cliente"
                value={textFilter}
                onChange={(e) => onText(e.target.value)}
                placeholder="Buscar OV, producto o cliente…"
                className="h-10 pl-9 bg-transparent border-white/8 focus-visible:border-primary/40 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Filter button — opens Drawer */}
            <button
              type="button"
              onClick={() => setFilterDrawerOpen(true)}
              title="Filtrar por cliente"
              aria-label="Filtrar por cliente"
              className={`relative h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                clientFilter
                  ? 'bg-primary/20 border-primary/50 text-primary'
                  : 'border-white/10 text-muted-foreground/60 hover:border-white/20 hover:text-muted-foreground'
              }`}
            >
              <SlidersHorizontal className="size-4" />
              {clientFilter && (
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
                className="h-11 w-11 shrink-0 flex items-center justify-center rounded-xl border border-white/10 text-muted-foreground/60 transition-colors hover:border-red-500/40 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* Client filter Drawer */}
        <Drawer open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
          <DrawerContent className="bg-[#050505]/98 border-white/5">
            <DrawerHeader className="pb-2">
              <DrawerTitle className="text-sm font-bold uppercase tracking-widest text-zinc-300">
                Filtrar por cliente
              </DrawerTitle>
            </DrawerHeader>
            <div className="px-4 pb-8 space-y-1 overflow-y-auto no-scrollbar max-h-[60dvh]">
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
                      : 'text-zinc-300 hover:bg-white/5'
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
  const visible = isTVMode ? (near || focused || menuOpen) : true;

  const handleDismiss = () => {
    setFocused(false);
    setMenuOpen(false);
  };

  return (
    <div
      ref={isTVMode ? anchorRef : undefined}
      className={isTVMode
        ? "absolute left-1/2 top-1 z-50 -translate-x-1/2"
        : "flex w-full justify-center py-2 mb-4 pointer-events-none"
      }
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false);
      }}
    >
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto"
          >
            <div className="glass-panel flex items-center gap-2 rounded-2xl px-3 py-2 shadow-overlay border border-white/10 bg-[#08080c]/90 backdrop-blur-xl">
              <SlidersHorizontal className="ml-1 size-4 shrink-0 text-cyan-400" />

              <Select
                value={clientFilter ?? ALL_CLIENTS}
                onValueChange={(v) => onClient(v === ALL_CLIENTS ? null : v)}
                onOpenChange={setMenuOpen}
              >
                <SelectTrigger aria-label="Filtrar por cliente" className="h-10 w-[210px] text-xs font-semibold border-white/10 bg-black/40">
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

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Buscar orden, producto o cliente"
                  value={textFilter}
                  onChange={(e) => onText(e.target.value)}
                  placeholder="Buscar OV o producto…"
                  className="h-10 w-[220px] pl-9 text-xs border-white/10 bg-black/40"
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
                  className="size-8 rounded-lg text-zinc-400 hover:text-white ml-1"
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
