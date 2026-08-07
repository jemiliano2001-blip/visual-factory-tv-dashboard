# Adaptive TV Page Packing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill partial TV pages with consecutive order segments from other companies while preserving all full company pages, and expose the client PO only in the order detail.

**Architecture:** Extract deterministic page construction into a pure utility that partitions full company pages from their remainders, then greedily packs only the remainders into shared pages. `TVDashboard` consumes its discriminated union instead of building `smallCompanies` inline; a focused shared-page component renders one full grid and gives each shared TV card a compact company badge. `OrderDetailsModal` renders the already-available Odoo client PO conditionally.

**Tech Stack:** React 19, TypeScript 5.8 strict compilation, Tailwind CSS 4, Framer Motion, Node's native test runner invoked through existing `tsx`.

## Global Constraints

- Keep all UI text in Spanish and preserve the TV's progress and priority color axes from `DESIGN.md`.
- Do not install dependencies; `tsx` and `@types/node` already exist in `devDependencies`.
- Do not use `any` or `@ts-ignore` in touched TypeScript.
- Do not change Odoo fetch criteria, delivery filtering, polling cadence, Firestore rules, or company configuration permissions.
- Treat `customer_reference` as detail-only data. Never add prices, amounts, or other confidential values to the TV card.
- Run `npm.cmd run lint` before each task commit and at the final gate.

---

### Task 1: Add a deterministic TV page-packing utility and its native tests

**Files:**
- Create: `src/utils/tvPagePacking.ts`
- Create: `src/utils/tvPagePacking.test.ts`
- Modify: `package.json:5-16`

**Interfaces:**
- Consumes: `OdooSaleOrder` from `src/services/odoo.ts`.
- Produces: `CompanyTVPage`, `SharedTVPageData`, `TVPage`, `SharedCompanySegment`, and `buildTVPages(orders, ordersPerPage)` from `src/utils/tvPagePacking.ts`.
- Produces: `npm.cmd run test:tv-page-packing`, which runs only the new Node-native unit tests through `tsx --test`.

- [ ] **Step 1: Write the failing page-packing tests**

Create `src/utils/tvPagePacking.test.ts` with a complete, minimal Odoo fixture and tests for the approved behavior:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import type { OdooSaleOrder } from '../services/odoo';
import { buildTVPages } from './tvPagePacking';

const order = (id: number, company: string): OdooSaleOrder => ({
  id, name: `2026/S${String(id).padStart(5, '0')}`,
  customer_reference: null, partner_name: company, main_product: 'Producto',
  date_order: '2026-08-01 00:00:00', commitment_date: null,
  invoice_status: 'to invoice', currency: 'MXN', qty_total: 1, qty_delivered: 0,
  state: 'sale', salesperson: null, lines_count: 1,
  lines: [{ name: 'Producto', qty: 1, delivered: 0 }], deliveries: [], note: null,
});

test('emite páginas completas antes de las páginas compartidas', () => {
  const orders = [
    ...Array.from({ length: 16 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 12 }, (_, i) => order(i + 17, 'B')),
    ...Array.from({ length: 8 }, (_, i) => order(i + 29, 'C')),
  ];
  const pages = buildTVPages(orders, 10);

  assert.deepEqual(pages.slice(0, 2).map(page => page.type), ['company', 'company']);
  assert.equal(pages[0].type === 'company' && pages[0].orders.length, 10);
  assert.equal(pages[1].type === 'company' && pages[1].orders.length, 10);
  assert.equal(pages[2].type, 'shared');
  assert.deepEqual(
    pages[2].type === 'shared' && pages[2].segments.map(segment => [segment.company, segment.orders.length]),
    [['A', 6], ['B', 2], ['C', 2]],
  );
});

test('no duplica órdenes y conserva un único sobrante como página exclusiva', () => {
  const source = [...Array.from({ length: 10 }, (_, i) => order(i + 1, 'A')), order(11, 'B')];
  const pages = buildTVPages(source, 10);
  const pageOrders = pages.flatMap(page => page.type === 'company'
    ? page.orders : page.segments.flatMap(segment => segment.orders));

  assert.deepEqual(pageOrders.map(item => item.id), source.map(item => item.id));
  assert.deepEqual(pages.map(page => page.type), ['company', 'company']);
  assert.equal(pages[1].type === 'company' && pages[1].company, 'B');
});

test('normaliza una capacidad inválida y parte un sobrante solo para completar la página', () => {
  assert.equal(buildTVPages([order(1, 'A')], 0).length, 1);
  const pages = buildTVPages([
    ...Array.from({ length: 6 }, (_, i) => order(i + 1, 'A')),
    ...Array.from({ length: 8 }, (_, i) => order(i + 7, 'B')),
  ], 10);
  assert.deepEqual(pages[0].type === 'shared' && pages[0].segments.map(s => [s.company, s.orders.length]), [['A', 6], ['B', 4]]);
  assert.deepEqual(pages[1].type === 'shared' && pages[1].segments.map(s => [s.company, s.orders.length]), [['B', 4]]);
});

test('mantiene cada orden localizable dentro de segmentos compartidos', () => {
  const source = [order(1, 'A'), order(2, 'A'), order(3, 'B')];
  const [page] = buildTVPages(source, 4);

  assert.equal(page.type, 'shared');
  const found = page.type === 'shared'
    && page.segments.some(segment => segment.orders.some(item => item.name === '2026/S00003'));
  assert.equal(found, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail before the utility exists**

Run: `npx.cmd tsx --test src/utils/tvPagePacking.test.ts`

Expected: FAIL because `./tvPagePacking` does not exist.

- [ ] **Step 3: Implement the pure discriminated-union page builder**

Create `src/utils/tvPagePacking.ts`. Use the following interface names and grouping strategy exactly so the TV renderer and its highlight lookup share one contract:

```ts
import type { OdooSaleOrder } from '../services/odoo';

export interface CompanyTVPage {
  type: 'company';
  company: string;
  orders: OdooSaleOrder[];
  current?: number;
  total?: number;
}

export interface SharedCompanySegment {
  company: string;
  orders: OdooSaleOrder[];
}

export interface SharedTVPageData {
  type: 'shared';
  segments: SharedCompanySegment[];
}

export type TVPage = CompanyTVPage | SharedTVPageData;

export function buildTVPages(orders: OdooSaleOrder[], ordersPerPage: number): TVPage[] {
  const capacity = Number.isFinite(ordersPerPage) && ordersPerPage > 0
    ? Math.max(1, Math.floor(ordersPerPage)) : 1;
  const byCompany = new Map<string, OdooSaleOrder[]>();
  for (const order of orders) {
    const group = byCompany.get(order.partner_name) ?? [];
    group.push(order);
    byCompany.set(order.partner_name, group);
  }

  const complete: CompanyTVPage[] = [];
  const remainders: SharedCompanySegment[] = [];
  for (const [company, companyOrders] of byCompany) {
    const fullPageCount = Math.floor(companyOrders.length / capacity);
    for (let pageIndex = 0; pageIndex < fullPageCount; pageIndex++) {
      complete.push({
        type: 'company',
        company,
        orders: companyOrders.slice(pageIndex * capacity, (pageIndex + 1) * capacity),
        current: pageIndex + 1,
        total: fullPageCount,
      });
    }
    const remainder = companyOrders.slice(fullPageCount * capacity);
    if (remainder.length > 0) remainders.push({ company, orders: remainder });
  }
  if (remainders.length === 0) return complete;
  if (remainders.length === 1) {
    return [...complete, { type: 'company', ...remainders[0] }];
  }

  const shared: SharedTVPageData[] = [];
  let remainderIndex = 0;
  let orderOffset = 0;
  while (remainderIndex < remainders.length) {
    let remainingSlots = capacity;
    const segments: SharedCompanySegment[] = [];
    while (remainingSlots > 0 && remainderIndex < remainders.length) {
      const remainder = remainders[remainderIndex];
      const chunk = remainder.orders.slice(orderOffset, orderOffset + remainingSlots);
      segments.push({ company: remainder.company, orders: chunk });
      remainingSlots -= chunk.length;
      orderOffset += chunk.length;
      if (orderOffset === remainder.orders.length) {
        remainderIndex++;
        orderOffset = 0;
      }
    }
    shared.push({ type: 'shared', segments });
  }
  return [...complete, ...shared];
}
```

The function returns an empty array for no orders, preserves the first-seen company order, preserves each company's order order, and returns a `company` page rather than a `shared` page when there is exactly one remainder.

- [ ] **Step 4: Add the narrow test command and prove the utility passes**

Add this script beside `lint` in `package.json`:

```json
"test:tv-page-packing": "tsx --test src/utils/tvPagePacking.test.ts"
```

Run: `npm.cmd run test:tv-page-packing`

Expected: all three Node-native subtests PASS.

- [ ] **Step 5: Compile and commit the isolated utility**

Run: `npm.cmd run lint`

Expected: TypeScript exits with code 0.

```bash
git add package.json src/utils/tvPagePacking.ts src/utils/tvPagePacking.test.ts
git commit -m "feat(tv): pack partial company pages"
```

### Task 2: Render shared pages as one full grid with compact company identity

**Files:**
- Create: `src/components/SharedTVPage.tsx`
- Modify: `src/pages/TVDashboard.tsx:1-225, 438-550, 774-929`
- Modify: `src/components/OdooOrderCard.tsx:16-25, 157-477`

**Interfaces:**
- Consumes: `SharedTVPageData` and `SharedCompanySegment` from `src/utils/tvPagePacking.ts`.
- Consumes: existing `OdooOrderCard`, `getCustomerLogo`, layout flags, selected-order callback, and highlighted SO.
- Produces: `SharedTVPage` React component that lays all segment orders into a single `gridCols × gridRows` grid.
- Produces: optional `companyBadge?: { name: string; logoUrl: string | null }` prop on `OdooOrderCard`.

- [ ] **Step 1: Re-run the page-packing suite before integrating the renderer**

Run: `npm.cmd run test:tv-page-packing`

Expected: PASS, including `mantiene cada orden localizable dentro de segmentos compartidos`.

- [ ] **Step 2: Build the shared-grid component and card badge**

Create `src/components/SharedTVPage.tsx` with a page header and one grid. Flatten segments only for rendering, preserving their sequence and passing a badge built from the segment's company:

```tsx
interface SharedTVPageProps {
  page: SharedTVPageData;
  gridCols: number;
  gridRows: number;
  isWide: boolean;
  isDense: boolean;
  screenTier: ScreenTier;
  highlightedSO: string | null;
  onOrderClick: (order: OdooSaleOrder) => void;
}

export function SharedTVPage({ page, gridCols, gridRows, isWide, isDense, screenTier, highlightedSO, onOrderClick }: SharedTVPageProps) {
  const cards = page.segments.flatMap(segment => segment.orders.map(order => ({
    order,
    badge: { name: segment.company, logoUrl: getCustomerLogo(segment.company) ?? null },
  })));

  return (
    <div className="flex flex-col h-full min-h-0 w-full">
      <div className="mb-3 lg:mb-4 flex items-center justify-between flex-shrink-0">
        <h2 className={`${isWide ? 'text-4xl lg:text-5xl' : 'text-xl lg:text-2xl'} font-black text-white tracking-tight uppercase`}>
          Múltiples clientes
        </h2>
        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">
          {page.segments.length} {page.segments.length === 1 ? 'cliente' : 'clientes'}
        </span>
      </div>
      <div className="grid gap-3 lg:gap-4 flex-1 min-h-0" style={{
        gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${gridRows}, minmax(0, 1fr))`,
      }}>
        {cards.map(({ order, badge }) => (
          <OdooOrderCard
            key={order.id}
            order={order}
            companyBadge={badge}
            isHighlighted={highlightedSO === order.name}
            isWide={isWide}
            isDense={isDense}
            screenTier={screenTier}
            viewMode="tv"
            onClick={() => onOrderClick(order)}
          />
        ))}
      </div>
    </div>
  );
}
```

The mapped `OdooOrderCard` receives the exact TV props shown in the snippet: `isHighlighted`, `isWide`, `isDense`, `screenTier`, `viewMode="tv"`, and `onClick`.

In `OdooOrderCard`, render `companyBadge` only when passed. In both the dense and normal TV branches, show its logo only when `logoUrl` exists and always include the uppercase `name` in a compact zinc/indigo badge. Place it adjacent to the existing customer/card metadata, never over the progress bar, priority badge, overdue marker, or SO number.

- [ ] **Step 3: Replace `smallCompanies` with the page utility in `TVDashboard`**

Make these targeted changes:

1. Delete the local `PageData` union and the `smallCompanies` threshold/pairing loop.
2. Import `TVPage` and `buildTVPages` from `../utils/tvPagePacking` and compute TV pages with `buildTVPages(filteredOdooOrders, ordersPerPage)`.
3. Keep the existing desktop branch grouped by company by mapping its `Object.entries(groupedOrders)` values to `{ type: 'company', company, orders }`; only TV mode calls the new utility.
4. Change the voice-highlight lookup to find either `page.orders` for `company` pages or any `segment.orders` for `shared` pages:

```ts
const pageIdx = pages.findIndex(page =>
  page.type === 'company'
    ? page.orders.some(order => order.name === highlightedSO)
    : page.segments.some(segment => segment.orders.some(order => order.name === highlightedSO)),
);
```

5. Pass `MÚLTIPLES CLIENTES` to `DashboardHeader.currentCompany` for a shared page. Pass `currentPage.current` and `currentPage.total` only when `currentPage.type === 'company'`; shared pages pass `undefined` for both values so the header never claims a misleading per-company page number.
6. Keep `CompanyTVSection` for `company` pages and render `SharedTVPage` for `shared` pages. Remove the two fixed half-width containers entirely.

- [ ] **Step 4: Compile, exercise the live behaviors, and commit the UI integration**

Run: `npm.cmd run test:tv-page-packing`

Expected: all unit cases PASS.

Run: `npm.cmd run lint`

Expected: TypeScript exits with code 0.

Start the existing local stack with `npm.cmd run dev:full`, then verify manually at 1920×1080:

1. A company with at least one full capacity chunk still renders on exclusive pages first.
2. A shared page fills every available card cell when enough remainders exist.
3. Every shared card identifies its company, with a text fallback for a missing logo.
4. Pause, next-page dots, client/text filters, voice PO highlighting, and the `delivered` override still target the correct page.
5. Desktop and mobile retain their existing scrollable grouped layouts.

```bash
git add src/components/SharedTVPage.tsx src/components/OdooOrderCard.tsx src/pages/TVDashboard.tsx src/utils/tvPagePacking.test.ts
git commit -m "feat(tv): render packed shared pages"
```

### Task 3: Show the customer PO in the order detail only

**Files:**
- Modify: `src/components/OrderDetailsModal.tsx:40-120, 183-230`

**Interfaces:**
- Consumes: existing `order.customer_reference: string | null` from `OdooSaleOrder`.
- Produces: a conditional `OC cliente` metadata row in both the mobile drawer and desktop dialog.

- [ ] **Step 1: Define the display value before the mobile/desktop branch**

Immediately after `priority`, add a normalized value that omits empty or whitespace-only references:

```ts
const customerReference = order.customer_reference?.trim() || null;
```

This is the only condition used in both render branches, preventing one viewport from exposing a blank row while the other hides it.

- [ ] **Step 2: Add the conditional metadata row in both detail layouts**

In each existing header-fields container, insert the same row between `Entrega` and `Responsable`:

```tsx
{customerReference && (
  <div className="flex justify-between items-center gap-3 px-4 py-3.5 min-h-[48px]">
    <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-bold">OC cliente</span>
    <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm min-w-0">
      <FileText className="w-4 h-4 text-blue-500/70 flex-shrink-0" />
      <span className="truncate max-w-[180px] font-mono-data">{customerReference}</span>
    </div>
  </div>
)}
```

For the desktop copy, retain its existing smaller horizontal constraints (`max-w-[160px] sm:max-w-full`) so the new value cannot overflow the dialog. Do not add this value to `OdooOrderCard`.

- [ ] **Step 3: Compile and manually check populated and absent references**

Run: `npm.cmd run lint`

Expected: TypeScript exits with code 0.

With the local dashboard running, open one order that has `customer_reference` and one that does not. Verify on desktop and at `<768px`:

1. A populated reference appears only in the modal/drawer as `OC cliente`.
2. A null, empty, or whitespace-only reference produces no empty metadata row.
3. The close button, scrolling detail lines, notes, and responsive drawer behavior remain usable.

- [ ] **Step 4: Commit the detail-only field**

```bash
git add src/components/OrderDetailsModal.tsx
git commit -m "feat(tv): show client PO in order detail"
```

### Task 4: Run the final regression gate and update the living specification state

**Files:**
- Modify: `docs/superpowers/specs/2026-08-07-adaptive-tv-page-packing-design.md:3-4`

**Interfaces:**
- Consumes: all completed feature files and their passing unit/TypeScript checks.
- Produces: a design document whose status says implementation is complete only after the regression gate passes.

- [ ] **Step 1: Run the complete automated gate**

Run:

```bash
npm.cmd run test:tv-page-packing
npm.cmd run lint
```

Expected: every Node-native test passes and TypeScript exits with code 0.

- [ ] **Step 2: Perform the operator-facing TV regression pass**

At 1920×1080, capture evidence for the following exact scenarios:

1. Capacity 10 with A×16, B×12, C×8 yields two exclusive full pages followed by a shared page A×6/B×2/C×2 and then C×6.
2. One company with an exact capacity page and one one-order company yields two exclusive pages, not a misleading shared page.
3. Filters and a voice-highlighted PO reset or navigate to the page containing that PO even when it is inside a shared segment.
4. A shared page's customer badge remains secondary to the SO, progress, and overdue signals at distance.
5. Desktop and mobile have no shared-page renderer because they continue to use the existing grouped scroll mode.

- [ ] **Step 3: Mark the implementation state and commit the verification record**

After every preceding check passes, replace the specification status with:

```markdown
**Estado:** implementado y validado el 2026-08-07.
```

Then commit the final verification record:

```bash
git add docs/superpowers/specs/2026-08-07-adaptive-tv-page-packing-design.md
git commit -m "docs: record TV page packing validation"
```
