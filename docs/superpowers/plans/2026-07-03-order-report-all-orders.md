# Bulk Order Report (All Orders, Filter-Aware) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Admin "Reporte" tab into a printable report covering every order currently visible in Admin (respecting the active client/status/search filters), instead of a one-order-at-a-time reference search — and remove the now-dead single-order-search code the previous (unshipped) pass introduced.

**Architecture:** Add the one missing field (`client_order_ref` → `customer_reference`) to the bulk Odoo query that `AdminPanel` already runs via `useOdooOrders()`, so the report needs zero new network calls — it renders directly from `filteredOrders`, the same array already driving the orders table and the Excel export. Remove the per-reference backend endpoint (`server.ts`, `functions/src/index.ts`, `shared/odooClient.ts`) and its frontend types/fetcher (`src/services/odoo.ts`, `src/types.ts`) since nothing will call them after the redesign. Rewrite `OrderReportTab.tsx` to render one printable "ficha" card per order in the passed-in list, with print CSS that puts each card on its own page.

**Tech Stack:** React + TypeScript, Express (local proxy `server.ts` + Firebase Cloud Function `functions/src/index.ts`), Odoo JSON-RPC via `shared/odooClient.ts`, Tailwind v4 + shadcn/ui, `dompurify`, browser print-to-PDF (no new dependency).

## Global Constraints

- `npm run lint` (`tsc --noEmit`) at the repo root, **and** `npm run build` inside `functions/` (also `tsc`), are the only automated gates in this repo — no unit test runner exists. Both must pass clean after every task.
- No new dependencies. Printing stays on `window.print()` — no PDF-generation library.
- All UI text is Spanish.
- Follow existing shadcn/ui + Tailwind patterns already in the file (`Card`, `Button`, existing class conventions) — no new component library.
- `order.note` is raw HTML from Odoo — must go through `DOMPurify.sanitize()` before `dangerouslySetInnerHTML`. Never render it raw.
- Leave no dead code behind: every type, function, and route removed in Task 2 must have zero remaining references anywhere in `.ts`/`.tsx` source after the task.
- `/api/*` routes require a valid Firebase ID token in both `server.ts` and `functions/src/index.ts` — this already applies to `/api/odoo/invoiceable-orders` and doesn't change in this plan.

---

### Task 1: Add `customer_reference` to the bulk Odoo query

**Files:**
- Modify: `shared/odooClient.ts:50-67` (interface), `shared/odooClient.ts:224-229` (fields list), `shared/odooClient.ts:286-311` (return mapping)
- Modify: `src/services/odoo.ts:32-66` (`OdooSaleOrder` interface)

**Interfaces:**
- Produces: `NormalizedInvoiceableOrder.customer_reference: string | null` and `OdooSaleOrder.customer_reference: string | null` — consumed by Task 3's `OrderReportTab`.

- [ ] **Step 1: Add the field to `NormalizedInvoiceableOrder`**

In `shared/odooClient.ts`, edit the interface at line 50-67:

```ts
export interface NormalizedInvoiceableOrder {
  id: number;
  name: string;
  customer_reference: string | null;
  partner_name: string;
  main_product: string;
  date_order: string;
  commitment_date: string | null;
  invoice_status: string;
  currency: string;
  qty_total: number;
  qty_delivered: number;
  state: string;
  salesperson: string | null;
  note: string | null;
  lines_count: number;
  lines: Array<{ name: string; qty: number; delivered: number }>;
  deliveries: Array<{ name: string; state: string; date_done: string | null }>;
}
```

(Only change: inserted `customer_reference: string | null;` right after `name: string;`.)

- [ ] **Step 2: Request the field from Odoo**

In the same file, `fetchInvoiceableOrders`, the `read` call at line 224-229 currently reads:

```ts
    const orders = await this.odooCall<RawOrder[]>('sale.order', 'read', [ids], {
      fields: [
        'name', 'partner_id', 'date_order', 'commitment_date', 'invoice_status',
        'currency_id', 'order_line', 'state', 'user_id', 'note',
      ],
    });
```

Change the `fields` array to:

```ts
    const orders = await this.odooCall<RawOrder[]>('sale.order', 'read', [ids], {
      fields: [
        'name', 'client_order_ref', 'partner_id', 'date_order', 'commitment_date',
        'invoice_status', 'currency_id', 'order_line', 'state', 'user_id', 'note',
      ],
    });
```

`RawOrder` already declares `client_order_ref?: string | false;` (line 26) — no interface change needed there.

- [ ] **Step 3: Map the field into the normalized return object**

In the same file, the `return orders.map(order => { ... return { ... } })` block at line 286-311 currently starts:

```ts
      return {
        id: order.id,
        name: order.name,
        partner_name: order.partner_id ? order.partner_id[1] : 'Desconocido',
```

Change to:

```ts
      return {
        id: order.id,
        name: order.name,
        customer_reference: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
        partner_name: order.partner_id ? order.partner_id[1] : 'Desconocido',
```

(Rest of the object literal is unchanged.)

- [ ] **Step 4: Add the field to the frontend `OdooSaleOrder` type**

In `src/services/odoo.ts`, edit the interface at line 32-66:

```ts
export interface OdooSaleOrder {
  id: number;
  /** Número de orden de venta, ej. "SO/2024/0042" */
  name: string;
  /** Referencia de compra del cliente (client_order_ref en Odoo), si existe */
  customer_reference: string | null;
  /** Nombre del cliente */
  partner_name: string;
  /** Descripción del producto principal */
  main_product: string;
```

(Only change: inserted the `customer_reference` field + doc comment right after `name`. The rest of the interface — `date_order` through `note` — is unchanged.)

- [ ] **Step 5: Compile-check both backends**

Run:
```bash
npm run lint
```
Expected: exits 0, no errors (this is `tsc --noEmit` at the repo root — it also type-checks `server.ts` and `shared/odooClient.ts`).

Run:
```bash
cd functions && npm run build && cd ..
```
Expected: exits 0, no errors (`functions/` has its own `tsconfig.json` and imports the same `shared/odooClient.ts`).

- [ ] **Step 6: Verify the field actually comes back from Odoo**

The Admin UI requires a real Firebase login to reach, so verify the backend directly instead. Start a throwaway proxy instance with the dev-only auth bypass, on a port that won't collide with a running dev server:

```bash
cd "D:\proyectos_code\SMV\visual-factory-tv-dashboard"
DEV_AUTH_BYPASS=true ODOO_PROXY_PORT=3099 npx tsx server.ts > /tmp/verify-proxy.log 2>&1 &
sleep 4
tail -20 /tmp/verify-proxy.log
```

Expected log output includes `🚀 Odoo Proxy corriendo en http://localhost:3099` and no error lines. Then:

```bash
curl -s "http://localhost:3099/api/odoo/invoiceable-orders" | node -e "
let data='';
process.stdin.on('data', d => data += d);
process.stdin.on('end', () => {
  const j = JSON.parse(data);
  const allHaveKey = j.orders.every(o => 'customer_reference' in o);
  const withRef = j.orders.find(o => o.customer_reference);
  console.log('total orders:', j.orders.length);
  console.log('every order has customer_reference key:', allHaveKey);
  console.log('example non-null value (if any order has a PO ref set in Odoo):', withRef ? withRef.customer_reference : '(none set right now — key still present as null, which is correct)');
});
"
```

Expected: `every order has customer_reference key: true`. A non-null example is a bonus confirmation, not required (depends on whether any current order actually has a customer PO ref set in Odoo).

**Always shut the throwaway proxy down afterward** — find and stop whatever is listening on 3099:

```bash
netstat -ano | grep ":3099" | grep LISTENING
```
Take the PID from the last column, then:
```bash
powershell -Command "Stop-Process -Id <PID> -Force"
```
(Plain `kill <PID>` from git-bash does not always release the port on Windows — confirm with `curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3099/api/odoo/status" --max-time 2` returning a curl error / `000`, not `200`.)

- [ ] **Step 7: Commit**

```bash
git add shared/odooClient.ts src/services/odoo.ts
git commit -m "feat(odoo): include customer PO reference in bulk order query"
```

---

### Task 2: Remove the dead single-order-report code

The previous (unshipped) pass added a per-reference search endpoint and its frontend plumbing. Nothing in the redesigned UI calls it (Task 3 renders straight from the bulk list) — remove it entirely rather than leaving it unused.

**Files:**
- Modify: `shared/odooClient.ts` — remove `NormalizedOrderReport` interface (lines 69-79) and `fetchOrderReportByReference` method (lines 315-372)
- Modify: `server.ts` — remove the `fetchOrderReportByReference` wrapper (lines 178-180) and the `GET /api/odoo/order-report` route (lines 229-256)
- Modify: `functions/src/index.ts` — remove the `GET /api/odoo/order-report` route (lines 139-161)
- Modify: `src/services/odoo.ts` — remove `OdooOrderReport` interface (lines 83-93), `OdooOrderReportResponse` interface (lines 102-106), and `fetchOrderReportByReference` function (lines 198-222)
- Modify: `src/types.ts:16-23` — drop the two removed types from the re-export list

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only deletes code. After this task, grepping the whole source tree for `order-report`, `OrderReportByReference`, `NormalizedOrderReport`, `OdooOrderReport`, `OdooOrderReportResponse` must return zero hits in `.ts`/`.tsx` files.

- [ ] **Step 1: Remove from `shared/odooClient.ts`**

Delete the `NormalizedOrderReport` interface (currently lines 69-79):

```ts
export interface NormalizedOrderReport {
  id: number;
  reference: string;
  customerReference: string | null;
  customerName: string;
  createdAt: string;
  quantity: number;
  description: string;
  terms: string | null;
  lines: Array<{ name: string; qty: number }>;
}
```

Delete the `fetchOrderReportByReference` method (currently lines 315-372, i.e. everything from `async fetchOrderReportByReference` down to its closing `}` right before the class's final `}`):

```ts
  async fetchOrderReportByReference(reference: string): Promise<NormalizedOrderReport | null> {
    const normalizedReference = reference.trim();
    if (!normalizedReference) return null;

    const exactDomain = [
      '|',
      ['name', '=', normalizedReference],
      ['client_order_ref', '=', normalizedReference],
    ];
    const fuzzyDomain = [
      '|',
      ['name', 'ilike', normalizedReference],
      ['client_order_ref', 'ilike', normalizedReference],
    ];

    let ids = await this.odooCall<number[]>(
      'sale.order',
      'search',
      [exactDomain],
      { limit: 1, order: 'date_order desc' },
    );
    if (!ids.length) {
      ids = await this.odooCall<number[]>(
        'sale.order',
        'search',
        [fuzzyDomain],
        { limit: 1, order: 'date_order desc' },
      );
    }
    if (!ids.length) return null;

    const orders = await this.odooCall<RawOrder[]>('sale.order', 'read', [ids], {
      fields: ['name', 'client_order_ref', 'partner_id', 'date_order', 'order_line', 'note'],
    });
    const order = orders[0];
    if (!order) return null;

    const lineIds = order.order_line;
    const lines = lineIds.length
      ? await this.odooCall<RawLine[]>('sale.order.line', 'read', [lineIds], {
          fields: ['name', 'display_type', 'product_uom_qty'],
        })
      : [];
    const productLines = lines.filter(line => !line.display_type);
    const quantity = productLines.reduce((sum, line) => sum + line.product_uom_qty, 0);

    return {
      id: order.id,
      reference: order.name,
      customerReference: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
      customerName: order.partner_id ? order.partner_id[1] : 'Desconocido',
      createdAt: order.date_order,
      quantity,
      description: productLines.map(line => line.name).join('\n') || 'Sin descripción',
      terms: typeof order.note === 'string' ? order.note : null,
      lines: productLines.map(line => ({ name: line.name, qty: line.product_uom_qty })),
    };
  }
```

The file should end with the `fetchInvoiceableOrders` method's closing `}` followed immediately by the class's closing `}`.

- [ ] **Step 2: Remove the route + wrapper from `server.ts`**

Delete the wrapper function (currently lines 178-180):

```ts
export async function fetchOrderReportByReference(reference: string) {
  return odooClient.fetchOrderReportByReference(reference);
}
```

Delete the route (currently lines 229-256, including its trailing blank line before the `// ─── Frontend en producción` comment):

```ts
app.get('/api/odoo/order-report', async (req: Request, res: Response) => {
  if (!odooClient.isConfigured()) {
    res.status(503).json({
      error: 'Odoo no configurado. Revisa las variables de entorno ODOO_*.',
      order: null,
    });
    return;
  }

  const reference = typeof req.query.reference === 'string' ? req.query.reference.trim() : '';
  if (!reference) {
    res.status(400).json({ error: 'Escribe una referencia para buscar.', order: null });
    return;
  }

  try {
    const order = await fetchOrderReportByReference(reference);
    if (!order) {
      res.status(404).json({ error: 'No se encontró una orden con esa referencia.', order: null });
      return;
    }
    res.json({ order, lastUpdated: new Date().toISOString() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Odoo] Error al buscar reporte de orden:', msg);
    res.status(500).json({ error: msg, order: null });
  }
});
```

- [ ] **Step 3: Remove the route from `functions/src/index.ts`**

Delete (currently lines 139-161):

```ts
app.get('/api/odoo/order-report', async (req: Request, res: Response) => {
  if (!odooClient.isConfigured()) {
    res.status(503).json({ error: 'Odoo no configurado. Agrega las env vars ODOO_* en functions/.env', order: null });
    return;
  }

  const reference = typeof req.query.reference === 'string' ? req.query.reference.trim() : '';
  if (!reference) {
    res.status(400).json({ error: 'Escribe una referencia para buscar.', order: null });
    return;
  }

  try {
    const order = await odooClient.fetchOrderReportByReference(reference);
    if (!order) {
      res.status(404).json({ error: 'No se encontró una orden con esa referencia.', order: null });
      return;
    }
    res.json({ order, lastUpdated: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err), order: null });
  }
});
```

- [ ] **Step 4: Remove the types and function from `src/services/odoo.ts`**

Delete the `OdooOrderReport` interface (currently lines 83-93):

```ts
export interface OdooOrderReport {
  id: number;
  reference: string;
  customerReference: string | null;
  customerName: string;
  createdAt: string;
  quantity: number;
  description: string;
  terms: string | null;
  lines: Array<{ name: string; qty: number }>;
}
```

Delete the `OdooOrderReportResponse` interface (currently lines 102-106):

```ts
export interface OdooOrderReportResponse {
  order: OdooOrderReport | null;
  lastUpdated?: string;
  error?: string;
}
```

Delete the `fetchOrderReportByReference` function (currently lines 198-222, sitting right after the `// ─── Utilidades de display ─────` comment and right before `formatCurrency`):

```ts
export async function fetchOrderReportByReference(reference: string): Promise<OdooOrderReportResponse> {
  const params = new URLSearchParams({ reference });
  try {
    const response = await fetch(`${PROXY_BASE}/api/odoo/order-report?${params.toString()}`, {
      signal: AbortSignal.timeout(30000),
      headers: await getAuthHeaders(),
    });
    const body = await response.json().catch(() => ({ error: response.statusText, order: null })) as OdooOrderReportResponse;

    if (!response.ok) {
      return {
        order: null,
        error: body.error || `Error HTTP ${response.status}`,
      };
    }

    return body;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      order: null,
      error: `No se pudo buscar la orden en Odoo: ${msg}`,
    };
  }
}
```

After deletion, the `// ─── Utilidades de display ─────...` comment should sit directly above `/** Formatea monto con símbolo de moneda */` / `export function formatCurrency(...)`, with a single blank line between them (same as it was before the order-report code was ever added).

- [ ] **Step 5: Update the re-exports in `src/types.ts`**

Current (lines 16-23):

```ts
export type {
  OdooSaleOrder,
  OdooOrderLine,
  OdooConnectionStatus,
  OdooOrdersResponse,
  OdooOrderReport,
  OdooOrderReportResponse,
} from './services/odoo';
```

Change to:

```ts
export type {
  OdooSaleOrder,
  OdooOrderLine,
  OdooConnectionStatus,
  OdooOrdersResponse,
} from './services/odoo';
```

- [ ] **Step 6: Compile-check both backends**

```bash
npm run lint
cd functions && npm run build && cd ..
```
Expected: both exit 0. If either fails, it means a reference to the removed code was missed — search the error message's file:line and remove the dangling reference.

- [ ] **Step 7: Confirm no dead references remain**

```bash
grep -rn "fetchOrderReportByReference\|NormalizedOrderReport\|OdooOrderReport\b\|OdooOrderReportResponse\|order-report" --include="*.ts" --include="*.tsx" src shared server.ts functions/src
```
Expected: no output (zero matches). If anything prints, remove that reference and re-run Step 6.

- [ ] **Step 8: Confirm the route is actually gone at runtime**

Reuse the throwaway-proxy technique from Task 1, Step 6 (bypass + alternate port), then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3099/api/odoo/order-report?reference=x"
```

Expected: `404` (Express's default "not found" for a route that no longer exists — before this task it would have returned `503`/`400`/`404`/`200` depending on input, all from the now-deleted handler). Stop the throwaway proxy afterward the same way as Task 1 Step 6.

- [ ] **Step 9: Commit**

```bash
git add shared/odooClient.ts server.ts functions/src/index.ts src/services/odoo.ts src/types.ts
git commit -m "refactor: remove unused single-order-reference report code"
```

---

### Task 3: Rewrite `OrderReportTab` as a bulk, filter-aware, printable report

**Files:**
- Modify: `src/components/admin/OrderReportTab.tsx` (full rewrite)
- Modify: `src/pages/AdminPanel.tsx:276-278`
- Modify: `src/index.css:172-218` (append page-break rule)

**Interfaces:**
- Consumes: `OdooSaleOrder` (with `customer_reference` from Task 1) from `src/services/odoo.ts`; `parseOdooDate` from the same module.
- Produces: `OrderReportTab` now takes `{ orders: OdooSaleOrder[] }` instead of `{ totalOrders: number }` — this is a breaking prop-signature change, so `AdminPanel.tsx`'s usage must be updated in the same task.

- [ ] **Step 1: Rewrite `src/components/admin/OrderReportTab.tsx`**

Replace the entire file with:

```tsx
import DOMPurify from 'dompurify';
import { format } from 'date-fns';
import { FileText, Printer } from 'lucide-react';
import { OdooSaleOrder, parseOdooDate } from '../../services/odoo';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface OrderReportTabProps {
  orders: OdooSaleOrder[];
}

function formatDate(value: string): string {
  const date = parseOdooDate(value);
  return date ? format(date, 'dd/MM/yyyy HH:mm') : 'Sin fecha';
}

export default function OrderReportTab({ orders }: OrderReportTabProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-4">
      <Card className="order-report-no-print">
        <CardHeader>
          <CardTitle>Reporte de órdenes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono-data text-3xl font-bold text-foreground">{orders.length}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Órdenes incluidas en el reporte — respeta los filtros activos en la pestaña Órdenes.
            </p>
          </div>
          <Button type="button" onClick={handlePrint} disabled={orders.length === 0}>
            <Printer /> Imprimir / PDF
          </Button>
        </CardContent>
      </Card>

      {orders.length === 0 ? (
        <Card className="order-report-no-print min-h-[360px]">
          <CardContent className="flex min-h-[360px] flex-col items-center justify-center text-center text-muted-foreground">
            <FileText className="mb-3 size-10 text-primary" />
            <p className="font-semibold text-foreground">No hay órdenes que coincidan con los filtros actuales.</p>
            <p className="mt-1 max-w-md text-sm">
              Ajusta los filtros en la pestaña Órdenes para incluir órdenes en este reporte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="order-report-printable space-y-4">
          {orders.map(order => (
            <OrderReportCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderReportCard({ order }: { order: OdooSaleOrder }) {
  const sanitizedTerms = DOMPurify.sanitize(order.note || '<p>Sin términos registrados.</p>');

  return (
    <Card className="order-report-card">
      <CardHeader className="border-b border-border">
        <p className="font-mono-data text-xs uppercase tracking-wider text-muted-foreground">Reporte de orden</p>
        <CardTitle className="mt-1 font-mono-data text-2xl">{order.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportField label="Referencia" value={order.name} mono />
          <ReportField label="Cliente / nombre" value={order.partner_name} />
          <ReportField label="Creado el" value={formatDate(order.date_order)} mono />
          <ReportField label="Cantidad" value={String(order.qty_total)} mono />
        </div>

        {order.customer_reference && (
          <ReportField label="Referencia del cliente" value={order.customer_reference} mono />
        )}

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Descripción
          </h3>
          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">{order.main_product}</p>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Líneas
          </h3>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 font-mono-data text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Descripción</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.lines.map((line, index) => (
                  <tr key={`${line.name}-${index}`}>
                    <td className="px-3 py-2 text-foreground/90">{line.name}</td>
                    <td className="px-3 py-2 text-right font-mono-data tabular-nums">{line.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="mb-2 font-mono-data text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Términos y condiciones
          </h3>
          <div
            className="prose prose-invert max-w-none rounded-xl border border-border bg-background/50 p-4 text-sm leading-6 text-foreground/90"
            dangerouslySetInnerHTML={{ __html: sanitizedTerms }}
          />
        </section>
      </CardContent>
    </Card>
  );
}

function ReportField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-background/50 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold text-foreground ${mono ? 'font-mono-data tabular-nums' : ''}`}>
        {value}
      </p>
    </div>
  );
}
```

Note the print/visibility class lives on the **list wrapper** (`<div className="order-report-printable space-y-4">`), not on each individual card — each card only carries `order-report-card` (used purely for the print page-break rule in Step 3 below). This matters: the existing print CSS's `.order-report-printable { position: absolute; inset: 0 auto auto 0; ... }` rule is designed for a single pinned element. Putting it on the wrapper keeps that single-element assumption true while still making every card underneath visible (via the existing `.order-report-printable *` visibility rule) and normally stacked in-flow for pagination.

- [ ] **Step 2: Update `src/pages/AdminPanel.tsx`**

Current (lines 276-278):

```tsx
            <TabsContent value="report" className="mt-5">
              <OrderReportTab totalOrders={orders.length} />
            </TabsContent>
```

Change to:

```tsx
            <TabsContent value="report" className="mt-5">
              <OrderReportTab orders={filteredOrders} />
            </TabsContent>
```

- [ ] **Step 3: Add the print pagination rule to `src/index.css`**

The existing `@media print` block (lines 172-218) stays exactly as-is — append this new rule immediately before the block's closing `}` (i.e. right after the existing `.order-report-no-print { display: none !important; }` rule):

```css
  .order-report-card {
    break-after: page;
  }

  .order-report-card:last-child {
    break-after: auto;
  }
```

- [ ] **Step 4: Compile-check**

```bash
npm run lint
```
Expected: exits 0. This will catch the prop-signature change if any other file still references `totalOrders` on `OrderReportTab` — there shouldn't be any besides `AdminPanel.tsx`, already updated in Step 2.

- [ ] **Step 5: Manual verification (requires a real admin login — cannot be automated in this environment)**

This step needs an actual Firebase email/password admin account, which isn't available in this environment — hand off to whoever has one:

1. `npm run dev:full`, log into `/admin` with a real admin account.
2. Open the "Reporte" tab with no filters active on "Órdenes" → confirm the ficha count matches the total order count shown on the "Órdenes" tab.
3. Go to "Órdenes", filter by a specific client (or toggle "Vencidas") → switch back to "Reporte" → confirm the ficha list shrinks to match that filter, and confirm in the browser DevTools Network tab that **no new request fired** when switching tabs (data reused from the already-loaded `orders`/`filteredOrders` — no `/api/odoo/order-report` call, since that route no longer exists).
4. Filter down to zero matching orders → confirm the "No hay órdenes que coincidan..." empty state renders instead of a blank list.
5. Click "Imprimir / PDF" → in the print preview, confirm each order starts on its own page and the header card / empty-state card (both `order-report-no-print`) are excluded from the printed output.
6. Find one order with a customer PO reference set in Odoo and one without → confirm "Referencia del cliente" only appears on the one that has it.
7. Find one order with a note (terms) set and one without → confirm the sanitized HTML renders for the first and "Sin términos registrados." renders for the second.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/OrderReportTab.tsx src/pages/AdminPanel.tsx src/index.css
git commit -m "feat(admin): bulk printable order report respecting active filters"
```

---

## Post-Plan Cleanup

- [ ] Remove the `.claude/launch.json` config added during the earlier (superseded) code review pass, **unless** the team wants to keep it for future `preview_start` use — it's harmless either way (points `npm run dev:full` at port 3000 for the Preview MCP tool). No action required unless the user objects to it being present.
