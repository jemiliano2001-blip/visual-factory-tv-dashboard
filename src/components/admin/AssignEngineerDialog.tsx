import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, UserCheck, UserPlus, Users } from 'lucide-react';
import {
  isManualEngineerId,
  normalizeEngineerNameKey,
  type AssignTarget,
  type EngineerRosterItem,
  type MyOrdersSubtab,
} from '../../../shared/orderAssignments';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface AssignEngineerDialogProps {
  open: boolean;
  orderKeys: string[];
  engineers: EngineerRosterItem[];
  myEngineerId: string | null;
  myEngineerName: string | null;
  currentEngineerId?: string | null;
  onAssign: (orderKeys: string[], target: AssignTarget, label: string) => void;
  onClose: () => void;
}

export function AssignEngineerDialog({
  open,
  orderKeys,
  engineers,
  myEngineerId,
  myEngineerName,
  currentEngineerId,
  onAssign,
  onClose,
}: AssignEngineerDialogProps) {
  const [nameInput, setNameInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setNameInput('');
      setError(null);
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
  }, [open]);

  const cleanInput = nameInput.replace(/\s+/g, ' ').trim();
  const normalizedQuery = normalizeEngineerNameKey(cleanInput);

  const rosterWithMe = useMemo(() => {
    if (!myEngineerId) return engineers;
    const meLabel = myEngineerName || 'Yo';
    const hasMe = engineers.some(e => e.id === myEngineerId);
    const list = hasMe
      ? engineers.map(e => (e.id === myEngineerId ? { ...e, name: meLabel } : e))
      : [{ id: myEngineerId, name: meLabel }, ...engineers];
    // Poner la cuenta propia primero y luego orden alfabético.
    return [...list].sort((a, b) => {
      if (a.id === myEngineerId) return -1;
      if (b.id === myEngineerId) return 1;
      return a.name.localeCompare(b.name, 'es-MX');
    });
  }, [engineers, myEngineerId, myEngineerName]);

  const filteredEngineers = useMemo(() => {
    if (!normalizedQuery) return rosterWithMe;
    return rosterWithMe.filter(e => normalizeEngineerNameKey(e.name).includes(normalizedQuery));
  }, [rosterWithMe, normalizedQuery]);

  const exactMatch = useMemo(
    () => (normalizedQuery ? rosterWithMe.find(e => normalizeEngineerNameKey(e.name) === normalizedQuery) ?? null : null),
    [rosterWithMe, normalizedQuery],
  );

  const handleSelectEngineer = (eng: EngineerRosterItem) => {
    if (orderKeys.length === 0) return;
    onAssign(orderKeys, { engineerId: eng.id, engineerName: eng.name }, eng.name);
    onClose();
  };

  const handleCreateOrAssignTyped = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (orderKeys.length === 0) return;
    if (cleanInput.length < 2 || cleanInput.length > 50) {
      setError('Escribe un nombre de entre 2 y 50 caracteres.');
      return;
    }
    if (exactMatch) {
      handleSelectEngineer(exactMatch);
      return;
    }
    onAssign(orderKeys, { engineerName: cleanInput }, cleanInput);
    onClose();
  };

  const orderSummary =
    orderKeys.length === 1
      ? `Orden ${orderKeys[0]}`
      : `${orderKeys.length} órdenes seleccionadas`;

  return (
    <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar ingeniero SMV</DialogTitle>
          <DialogDescription>
            {orderSummary}. Si eliges o agregas a otro ingeniero, la orden también quedará en tu subpestaña dentro de <strong>Mis órdenes</strong>.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleCreateOrAssignTyped} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="assign-engineer-input" className="block text-xs font-semibold text-foreground">
              Buscar o agregar nombre de ingeniero
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                id="assign-engineer-input"
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={50}
                value={nameInput}
                onChange={ev => {
                  setNameInput(ev.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ej. Rogelio, Edgar, Carlos…"
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error ? 'assign-engineer-error' : undefined}
                className="min-h-11 flex-1 rounded-xl border border-input bg-background/60 px-3.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              {cleanInput.length > 0 && (
                <Button type="submit" className="min-h-11 px-4 text-sm font-semibold rounded-xl">
                  <UserPlus className="size-4" aria-hidden="true" />
                  Asignar
                </Button>
              )}
            </div>
            {error && (
              <p id="assign-engineer-error" role="alert" className="text-xs font-medium text-destructive">
                {error}
              </p>
            )}
          </div>

          {cleanInput.length >= 2 && !exactMatch && (
            <button
              type="button"
              onClick={() => handleCreateOrAssignTyped()}
              className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3.5 py-2.5 text-left text-sm font-semibold text-foreground transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex items-center gap-2">
                <UserPlus className="size-4 text-primary" aria-hidden="true" />
                <span>Agregar y asignar a «{cleanInput}»</span>
              </span>
              <Badge variant="muted">Nuevo</Badge>
            </button>
          )}

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-muted-foreground">
              Ingenieros registrados ({filteredEngineers.length})
            </span>
            {filteredEngineers.length === 0 ? (
              <p className="rounded-xl border border-border bg-card/50 px-3.5 py-4 text-center text-xs text-muted-foreground">
                No hay coincidencias. Presiona <strong>Asignar</strong> arriba para agregar a «{cleanInput || 'nuevo ingeniero'}».
              </p>
            ) : (
              <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                {filteredEngineers.map(eng => {
                  const isSelf = eng.id === myEngineerId;
                  const isCurrent = currentEngineerId === eng.id;
                  const isManual = isManualEngineerId(eng.id);
                  return (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => handleSelectEngineer(eng)}
                      className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                        isCurrent
                          ? 'border-primary/40 bg-primary/10 font-semibold text-foreground'
                          : 'border-border bg-card/60 text-foreground hover:bg-accent'
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <UserCheck className={`size-4 shrink-0 ${isSelf ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden="true" />
                        <span className="truncate">{eng.name}</span>
                        {isSelf && <Badge variant="muted">Tú</Badge>}
                        {!isSelf && isManual && <Badge variant="muted">Sin cuenta</Badge>}
                      </span>
                      {isCurrent && <Check className="size-4 shrink-0 text-primary" aria-label="Asignado actualmente" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11 rounded-xl" onClick={onClose}>
              Cancelar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface MyOrdersSubtabBarProps {
  subtabs: MyOrdersSubtab[];
  activeSubtab: string;
  onSelectSubtab: (id: string) => void;
}

export function MyOrdersSubtabBar({
  subtabs,
  activeSubtab,
  onSelectSubtab,
}: MyOrdersSubtabBarProps) {
  if (subtabs.length === 0) return null;
  return (
    <div
      role="tablist"
      aria-label="Subpestañas de Mis órdenes por ingeniero"
      className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 p-2"
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 text-xs font-semibold text-muted-foreground">
        <Users className="size-3.5" aria-hidden="true" />
        Mis órdenes por ingeniero:
      </span>
      {subtabs.map(tab => {
        const active = tab.id === activeSubtab;
        return (
          <button
            key={tab.id || '__all__'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelectSubtab(tab.id)}
            className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary text-secondary-foreground hover:bg-accent'
            }`}
          >
            <span>{tab.label}</span>
            <span
              className={`rounded-md px-1.5 py-0.5 font-mono-data text-xs tabular-nums ${
                active ? 'bg-black/20 text-primary-foreground' : 'bg-background/50 text-muted-foreground'
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
