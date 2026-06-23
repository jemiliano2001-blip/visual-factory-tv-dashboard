/**
 * Barra de control flotante para la TV. Aparece solo cuando el mouse se acerca
 * a su zona (arriba-centro) y se oculta apenas se aleja — en la tele de pared,
 * sin mouse, nunca aparece. Deja a los ingenieros filtrar al instante por
 * cliente / texto y pausar la rotación, sin usar voz.
 *
 * Es un overlay absolute: NO empuja el grid (no dispara el ResizeObserver). El
 * div ancla queda siempre montado (colapsa a un punto cuando la barra está
 * oculta) para poder detectar la cercanía del cursor y reaparecer.
 */
import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, Pause, Play, X, SlidersHorizontal } from 'lucide-react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from './ui/select';
import { useProximityVisible } from '../hooks/useProximityVisible';

const ALL_CLIENTS = '__all__';

interface TVControlBarProps {
  isTVMode: boolean;
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
  isTVMode, clients, clientFilter, onClient, textFilter, onText, isPaused, onTogglePause, onClear,
}) => {
  const [anchorRef, near] = useProximityVisible<HTMLDivElement>(160);
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // TV: proximity-based (no molesta en pantalla de pared sin mouse).
  // Desktop: siempre visible para que los ingenieros puedan filtrar.
  const visible = isTVMode ? (near || focused || menuOpen) : true;
  const hasFilters = !!clientFilter || !!textFilter || isPaused;

  return (
    <div
      ref={isTVMode ? anchorRef : undefined}
      className={isTVMode
        ? "absolute left-1/2 top-0 z-40 -translate-x-1/2"
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
            <div className="glass-panel flex items-center gap-2 rounded-2xl px-2.5 py-2 shadow-overlay">
              <SlidersHorizontal className="ml-1 size-4 shrink-0 text-muted-foreground" />

              <Select
                value={clientFilter || ALL_CLIENTS}
                onValueChange={(v) => onClient(v === ALL_CLIENTS ? null : v)}
                onOpenChange={setMenuOpen}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue placeholder="Todos los clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLIENTS}>Todos los clientes</SelectItem>
                  {clients.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={textFilter}
                  onChange={(e) => onText(e.target.value)}
                  placeholder="Buscar OV o producto…"
                  className="h-9 w-[220px] pl-9"
                />
              </div>

              <Button
                type="button"
                variant={isPaused ? 'default' : 'secondary'}
                size="sm"
                onClick={onTogglePause}
                title={isPaused ? 'Reanudar rotación automática' : 'Pausar rotación automática'}
              >
                {isPaused ? <Play /> : <Pause />}
                {isPaused ? 'Reanudar' : 'Pausar'}
              </Button>

              {hasFilters && (
                <Button type="button" variant="ghost" size="sm" onClick={onClear} title="Limpiar filtros">
                  <X /> Limpiar
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
