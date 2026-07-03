# Reporte de Órdenes (todas, respetando filtros) — Design Spec

**Date:** 2026-07-03
**Project:** Visual Factory TV Dashboard
**Status:** Approved

---

## Context

An earlier, uncommitted pass at this feature added a "Reporte" tab to the Admin console (`src/components/admin/OrderReportTab.tsx`) that let a user search for **one** order by reference and view a printable "ficha" (reference, customer, dates, quantity, description, line items, terms/conditions). It called a new backend endpoint (`GET /api/odoo/order-report?reference=...`) that ran 2-3 separate Odoo RPC calls per lookup.

That single-order search isn't what's needed. The actual requirement: a **complete report covering all orders currently visible in Admin** (i.e. respecting whatever filters are already applied on the "Órdenes" tab — client, overdue/on-time, free-text search), not a one-at-a-time lookup. Doing this via the existing per-reference endpoint would mean N sequential Odoo RPC round-trips (N = number of filtered orders, currently ~105 unfiltered) — slow and wasteful.

**Key realization:** `AdminPanel` already holds everything the ficha needs in memory, in `filteredOrders` (the same array driving the orders table and the existing Excel export), fetched once via the shared `useOdooOrders()` hook. The only field missing from that shape is `client_order_ref` (the customer's own PO reference), which Odoo already returns but the bulk query doesn't request yet. Adding one field to an existing query removes the need for any per-order network call.

This spec replaces the single-order-search design with a bulk report that reuses already-loaded data, and removes the now-dead per-reference code the previous pass introduced (it never shipped/deployed).

---

## Architecture

### Files

| File | Change |
|------|--------|
| `shared/odooClient.ts` | Edit — add `'client_order_ref'` to the `sale.order` `read` fields list in `fetchInvoiceableOrders`; add `customer_reference: string \| null` to `NormalizedInvoiceableOrder`. Remove `fetchOrderReportByReference` and `NormalizedOrderReport` (dead code from the abandoned single-order design). |
| `server.ts` | Remove the `GET /api/odoo/order-report` route and the `fetchOrderReportByReference` export wrapper. |
| `functions/src/index.ts` | Remove the mirrored `GET /api/odoo/order-report` route. |
| `src/services/odoo.ts` | Add `customer_reference: string \| null` to `OdooSaleOrder`. Remove `fetchOrderReportByReference`, `OdooOrderReport`, `OdooOrderReportResponse`. |
| `src/types.ts` | Remove the now-gone `OdooOrderReport` / `OdooOrderReportResponse` re-exports. |
| `src/components/admin/OrderReportTab.tsx` | Rewrite — from single-reference search to a bulk, print-ready report over a passed-in order list. |
| `src/pages/AdminPanel.tsx` | Change the prop passed to `OrderReportTab`: `orders={filteredOrders}` instead of `totalOrders={orders.length}`. |
| `src/index.css` | Replace the single-card print rules with rules that paginate one ficha per printed page across a list. |

### Data flow

```
useOdooOrders() → orders (all, invoice_status = 'to invoice')
AdminPanel: filteredOrders = orders filtered by search/client/status/AI-filter
  ├─ "Órdenes" tab: renders filteredOrders in OrdersTable, feeds handleExport (Excel)
  └─ "Reporte" tab: <OrderReportTab orders={filteredOrders} />
       → renders one printable ficha per order, no additional fetch
       → "Imprimir / PDF" → window.print() (same mechanism as before)
```

No new backend call. The report is exactly as fresh as whatever is on screen, and instantly reflects filter changes — no loading state needed.

### `OdooSaleOrder.customer_reference`

Odoo's `sale.order.client_order_ref` is the customer's own PO number (already used ad hoc elsewhere in the app for PO-number matching/highlighting). It was never part of the bulk invoiceable-orders payload. Adding it:

```ts
// shared/odooClient.ts — RawOrder already declares this field (leftover from the
// abandoned design), just needs to be requested and mapped:
fields: [
  'name', 'client_order_ref', 'partner_id', 'date_order', 'commitment_date',
  'invoice_status', 'currency_id', 'order_line', 'state', 'user_id', 'note',
],
// ...
customer_reference: typeof order.client_order_ref === 'string' ? order.client_order_ref : null,
```

### `OrderReportTab.tsx` — new shape

```ts
interface OrderReportTabProps {
  orders: OdooSaleOrder[];
}
```

- **Header bar (`.order-report-no-print`):** shows `{orders.length} órdenes en el reporte` and one line noting it reflects the active filters from the "Órdenes" tab. A single **"Imprimir / PDF"** button (`window.print()` — unchanged mechanism, no new dependency).
- **Empty state:** if `orders.length === 0`, a centered message ("No hay órdenes que coincidan con los filtros actuales.") instead of an empty page.
- **Body:** one `OrderReportCard` per order (extracted as a small internal component so each card independently sanitizes its own `note` via `DOMPurify.sanitize()` — reusing the existing `dangerouslySetInnerHTML` pattern from the prior design). Per card:
  - Referencia (`order.name`), Cliente (`order.partner_name`), Referencia del cliente (`order.customer_reference`, omitted if null), Fecha de creación (`parseOdooDate(order.date_order)` formatted `dd/MM/yyyy HH:mm`), Cantidad total (`order.qty_total`).
  - Descripción: `order.main_product`.
  - Líneas: table over `order.lines` (`name` / `qty`), same as the prior ficha.
  - Términos y condiciones: `order.note`, HTML-sanitized, falling back to "Sin términos registrados." when null.
- **Removed vs. prior design:** the reference search box/form, the per-order "Correo" (mailto) button — neither fits a bulk, filter-driven report. Can be reconsidered later as a separate ask if needed.

### Print CSS (`src/index.css`)

Replace the single `.order-report-printable` block with pagination-aware rules so each ficha prints on its own page:

```css
@media print {
  /* ...existing hide-everything-but-.order-report-printable rules... */
  .order-report-card {
    break-after: page;
  }
  .order-report-card:last-child {
    break-after: auto;
  }
}
```

(Selectors/colors otherwise carried over unchanged from the existing print block.)

---

## Testing

`npm run lint` (`tsc --noEmit`, both root and `functions/`) is the only automated gate — must pass clean, including after removing the per-reference code paths (no leftover imports/types).

Manual verification (dev server, real admin login required — not automatable via the anonymous TV session):
1. Open Admin → "Reporte" tab with no filters active → confirm it lists every currently-loaded order as a ficha, count matches "Órdenes" tab total.
2. Apply a client filter and/or "Vencidas" status filter on the "Órdenes" tab, switch to "Reporte" → confirm the report list shrinks to match, with no extra network request fired (check Network tab: no call to a per-order endpoint).
3. Filter down to zero matches → confirm the empty-state message renders instead of a blank page.
4. Click "Imprimir / PDF" → confirm the browser print preview shows one order per page, with the header/filter-bar and any `.order-report-no-print` controls excluded.
5. Order with `client_order_ref` present vs. absent → confirm the "Referencia del cliente" line only appears when present.
6. Order with `note = null` vs. HTML content → confirm "Sin términos registrados." fallback vs. sanitized HTML rendering.

---

## Out of Scope

- Per-order email (mailto) action — removed from this design; can be re-added later as a distinct feature if requested.
- A dedicated PDF-generation library (jsPDF, etc.) — browser print-to-PDF is reused as-is.
- Any change to the Excel export (`handleExport` in `AdminPanel.tsx`) — untouched, remains the quick tabular summary; this report is the detailed, printable counterpart.
- Server-side pagination/chunking of the report for very large order counts — not needed at current volumes (~100-150 orders); revisit if that grows an order of magnitude.
