/** "Mi cuenta": preferencias guardadas en la cuenta (siguen a la persona en cualquier compu). */
import { useEffect, useMemo, useState } from 'react';
import type { OdooSaleOrder } from '../../services/odoo';
import { ADMIN_SECTIONS, type AdminSectionId } from '../../services/adminSections';
import { normalizeCompanyName } from '../../services/companyConfigGuards';
import { MAX_COPIES, MIN_COPIES, type UserSettings } from '../../services/userSettings';
import { useUserSettings } from '../../hooks/useUserSettings';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { SegmentedControl } from '../ui/segmented-control';

const SELECT = 'min-h-11 w-full rounded-xl border border-input bg-background/40 px-3.5 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30';
const MANY = '__many__';

export default function MyAccount({ orders }: { orders: readonly OdooSaleOrder[] }) {
  const { settings, loaded, error, saving, update } = useUserSettings();
  const [draft, setDraft] = useState<UserSettings>(settings);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (loaded) setDraft(settings); }, [loaded, settings]);

  const clients = useMemo(() => [...new Set(orders.map(o => o.partner_name))].sort((a, b) => a.localeCompare(b, 'es-MX')), [orders]);
  const followed = draft.followedClients;
  const clientValue = followed.length === 0 ? '' : followed.length === 1 ? followed[0] : MANY;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  async function save() {
    setSaved(false);
    try {
      await update(draft);
      setSaved(true);
    } catch { /* el error se muestra abajo */ }
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Mi cuenta</h2>
        <p className="text-sm text-muted-foreground">Se guarda en tu cuenta: la ves igual en cualquier computadora.</p>
      </div>
      {!loaded && !error && <p className="text-sm text-muted-foreground">Cargando…</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Vista de inicio</span>
          <select className={SELECT} value={draft.startView} onChange={e => setDraft({ ...draft, startView: e.target.value as AdminSectionId })}>
            {ADMIN_SECTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Cliente que sigo (filtro inicial)</span>
          <select
            className={SELECT}
            value={clientValue}
            onChange={e => setDraft({ ...draft, followedClients: e.target.value ? [normalizeCompanyName(e.target.value)] : [] })}
          >
            <option value="">Todos</option>
            {clientValue === MANY && <option value={MANY}>Varios ({followed.length}) — elige uno para filtrar</option>}
            {clients.map(c => <option key={c} value={normalizeCompanyName(c)}>{c}</option>)}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Copias al imprimir planos ({MIN_COPIES}–{MAX_COPIES})</span>
          <input
            type="number" min={MIN_COPIES} max={MAX_COPIES} className={SELECT} value={draft.print.copies}
            onChange={e => setDraft({ ...draft, print: { ...draft.print, copies: Math.min(MAX_COPIES, Math.max(MIN_COPIES, Math.trunc(Number(e.target.value)) || MIN_COPIES)) } })}
          />
        </label>
        <label className="flex min-h-11 items-center gap-2 self-end text-sm text-foreground">
          <input type="checkbox" checked={draft.print.boardTicket} onChange={e => setDraft({ ...draft, print: { ...draft.print, boardTicket: e.target.checked } })} />
          Incluir ficha de pizarrón por defecto
        </label>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Tema</span>
          <SegmentedControl
            label="Tema" value={draft.appearance.theme}
            options={[{ value: 'dark', label: 'Oscuro' }, { value: 'light', label: 'Claro' }]}
            onChange={theme => setDraft({ ...draft, appearance: { ...draft.appearance, theme } })}
          />
        </div>
        <div className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Densidad de tablas</span>
          <SegmentedControl
            label="Densidad" value={draft.appearance.density}
            options={[{ value: 'comfortable', label: 'Cómoda' }, { value: 'compact', label: 'Compacta' }]}
            onChange={density => setDraft({ ...draft, appearance: { ...draft.appearance, density } })}
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={!loaded || saving || !dirty}>{saving ? 'Guardando…' : 'Guardar'}</Button>
        {saved && !dirty && <span className="text-sm text-muted-foreground">Guardado.</span>}
        {error && <span role="alert" className="text-sm text-destructive">No se pudo guardar tu configuración: {error.message}</span>}
      </div>
    </Card>
  );
}
