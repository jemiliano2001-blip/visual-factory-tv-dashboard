/**
 * Horarios de entrega por cliente. Odoo manda sobre el horario manual: cada fila muestra
 * ambos y dice cuál usa la TV. Escribe solo en company_configs (requiere claim `admin`).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Clock, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { CompanyConfig } from '../../types';
import {
  createCompanyConfig, deleteCompanyConfig, subscribeToCompanyConfigs, updateCompanyConfig,
} from '../../services/companyConfigs';
import { hasDuplicateCompanyConfig } from '../../services/companyConfigGuards';
import {
  buildScheduleRows, filterScheduleRows, resolveClientName, validateScheduleInput,
  MAX_NAME_LENGTH, MAX_SCHEDULE_LENGTH, type ScheduleRow,
} from '../../services/configView';
import type { OdooSaleOrder } from '../../services/odoo';
import { useMobile } from '../../hooks/useMobile';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '../ui/drawer';
import { Input } from '../ui/input';
import { Label } from '../ui/label';

const SOURCE_BADGE = {
  odoo: { label: 'Odoo manda', variant: 'info' },
  manual: { label: 'Manual', variant: 'success' },
  none: { label: 'Sin horario', variant: 'muted' },
} as const;

const dateFmt = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });

const ALERT = 'rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive';

interface Props { orders: readonly OdooSaleOrder[]; canEdit: boolean; permissionLoading: boolean }

export default function ScheduleList({ orders, canEdit, permissionLoading }: Props) {
  const isMobile = useMobile();
  const [configs, setConfigs] = useState<CompanyConfig[] | null>(null); // null = aún no llega el primer snapshot
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScheduleRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeToCompanyConfigs(setConfigs, err => {
      setLoadError(err.message || 'No se pudieron cargar los horarios.');
      setConfigs(prev => prev ?? []);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const rows = useMemo(() => buildScheduleRows(orders, configs ?? []), [orders, configs]);
  const shown = useMemo(() => filterScheduleRows(rows, search), [rows, search]);
  const editable = canEdit && !permissionLoading;

  const openForm = (row: ScheduleRow | null) => {
    setEditing(row);
    setName(row?.name ?? '');
    setSchedule(row?.manual ?? '');
    setFormError(null);
    setFormOpen(true);
  };
  const closeForm = () => { if (!isSaving) setFormOpen(false); };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    const check = validateScheduleInput(name, schedule);
    if (!check.ok) { setFormError(check.error); return; }
    if (hasDuplicateCompanyConfig(configs ?? [], name, editing?.configId ?? undefined)) {
      setFormError('Ya existe un horario para este cliente. Edita el existente en lugar de crear otro.');
      return;
    }
    setFormError(null);
    setIsSaving(true);
    try {
      const data = { company_name: resolveClientName(name, rows), delivery_schedule: schedule.trim() };
      if (editing?.configId) await updateCompanyConfig(editing.configId, data);
      else await createCompanyConfig(data);
      setFormOpen(false);
      setNotice(`Horario de ${data.company_name} guardado.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el horario.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.configId || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteCompanyConfig(deleteTarget.configId);
      setNotice(`Horario manual de ${deleteTarget.name} eliminado.`);
      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'No se pudo eliminar el horario.');
    } finally {
      setDeleting(false);
    }
  };

  const knownNames = rows.filter(r => !r.configId).map(r => r.name);

  const form = (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="schedule-client">Cliente</Label>
        <Input
          id="schedule-client" list="schedule-client-options" value={name} maxLength={MAX_NAME_LENGTH}
          onChange={e => setName(e.target.value)} placeholder="Escribe o elige un cliente" autoComplete="off"
        />
        <datalist id="schedule-client-options">
          {knownNames.map(n => <option key={n} value={n} />)}
        </datalist>
      </div>
      <div className="space-y-2">
        <Label htmlFor="schedule-text">Horario de entrega (manual)</Label>
        <Input
          id="schedule-text" value={schedule} maxLength={MAX_SCHEDULE_LENGTH}
          onChange={e => setSchedule(e.target.value)} placeholder="Lunes a Viernes: 08:00 - 17:00"
        />
        {editing?.odoo && (
          <p className="text-xs text-muted-foreground">
            Este cliente ya tiene horario en Odoo ({editing.odoo}); la TV usa ese. Este manual queda de respaldo.
          </p>
        )}
      </div>
      {formError && <p role="alert" className={ALERT}>{formError}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" className="min-h-11" onClick={closeForm} disabled={isSaving}>Cancelar</Button>
        <Button type="submit" className="min-h-11" disabled={isSaving}>
          {isSaving ? 'Guardando…' : editing?.configId ? 'Actualizar' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
  const formTitle = editing?.configId ? `Editar horario de ${editing.name}` : 'Nuevo horario';
  const formHint = 'Se guarda como horario manual. Si Odoo tiene horario para este cliente, Odoo manda.';

  return (
    <section className="space-y-4" aria-labelledby="schedules-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="schedules-title" className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Clock className="size-5 text-primary" /> Horarios de entrega
          </h3>
          <p className="text-sm text-muted-foreground">
            Odoo manda: el horario del contacto en Odoo se muestra en la TV. El manual sirve de respaldo cuando Odoo no tiene uno.
          </p>
        </div>
        <Button className="min-h-11" onClick={() => openForm(null)} disabled={!editable}><Plus /> Nuevo horario</Button>
      </div>

      {!permissionLoading && !canEdit && (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          Tu cuenta no puede editar horarios. Pide que te activen el permiso de editor.
        </p>
      )}
      {notice && <p role="status" className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-foreground">{notice}</p>}
      {loadError && <p role="alert" className={ALERT}>{loadError}</p>}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="schedule-search" className="sr-only">Buscar cliente</label>
        <Input id="schedule-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente…" className="pl-10" />
      </div>

      {configs === null ? (
        <p role="status" className="py-8 text-center text-muted-foreground">Cargando horarios…</p>
      ) : shown.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {rows.length === 0 ? 'No hay clientes ni horarios todavía.' : 'Ningún cliente coincide con la búsqueda.'}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(row => {
            const badge = SOURCE_BADGE[row.source];
            return (
              <li key={row.key}>
                <Card className="h-full space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="break-words font-bold text-foreground">{row.name}</h4>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        {row.orphan && <Badge variant="outline">Sin órdenes abiertas</Badge>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost" size="icon" className="min-h-11 min-w-11" disabled={!editable}
                        aria-label={`${row.configId ? 'Editar' : 'Agregar'} horario manual de ${row.name}`}
                        onClick={() => openForm(row)}
                      >
                        {row.configId ? <Pencil /> : <Plus />}
                      </Button>
                      {row.configId && (
                        <Button
                          variant="ghost" size="icon" className="min-h-11 min-w-11 hover:text-destructive" disabled={!editable}
                          aria-label={`Eliminar horario manual de ${row.name}`}
                          onClick={() => { setDeleteError(null); setDeleteTarget(row); }}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </div>
                  <dl className="space-y-1 text-sm">
                    {row.odoo && (
                      <div><dt className="text-xs text-muted-foreground">Odoo (la TV usa este)</dt><dd className="text-foreground">{row.odoo}</dd></div>
                    )}
                    {row.manual && (
                      <div>
                        <dt className="text-xs text-muted-foreground">{row.odoo ? 'Manual (respaldo, hoy no se usa)' : 'Manual'}</dt>
                        <dd className={row.odoo ? 'text-muted-foreground' : 'text-foreground'}>{row.manual}</dd>
                      </div>
                    )}
                    {!row.odoo && !row.manual && <dd className="text-muted-foreground">Sin horario en Odoo ni manual.</dd>}
                  </dl>
                  {row.updatedAt && <p className="text-xs text-muted-foreground">Editado el {dateFmt.format(row.updatedAt)}</p>}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {isMobile ? (
        <Drawer open={formOpen} onOpenChange={open => { if (!open) closeForm(); }}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>{formTitle}</DrawerTitle><DrawerDescription>{formHint}</DrawerDescription></DrawerHeader>
            <div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{form}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={formOpen} onOpenChange={open => { if (!open) closeForm(); }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{formTitle}</DialogTitle><DialogDescription>{formHint}</DialogDescription></DialogHeader>
            {form}
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => { if (!open && !deleting) setDeleteTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar horario manual</DialogTitle>
            <DialogDescription>
              Se eliminará el horario manual de {deleteTarget?.name}.
              {deleteTarget?.odoo ? ' La TV seguirá usando el horario de Odoo.' : ''} Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className={ALERT}>{deleteError}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" className="min-h-11" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
            <Button type="button" variant="destructive" className="min-h-11" onClick={handleDelete} disabled={deleting}>{deleting ? 'Eliminando…' : 'Eliminar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
