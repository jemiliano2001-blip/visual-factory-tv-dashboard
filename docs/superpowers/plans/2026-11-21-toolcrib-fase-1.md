# Fase 1: vista Tool Crib (reemplaza Pendientes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la sección Pendientes del Admin por una vista Tool Crib que lista las partidas de las órdenes de Suprajit con su estado derivado de Odoo y de las solicitudes de factura/remisión.

**Architecture:** Lógica pura nueva en `src/services/toolCrib.ts` (probada con `node:test`). La sección `pending` pasa a llamarse `toolcrib` en `adminFilters.ts` y `adminSections.ts`, con los links viejos redirigidos. Un componente `ToolCribTab.tsx` toma el lugar de `PendingTab.tsx`. `pendingItems.ts` se conserva intacto.

**Tech Stack:** React 19 + Vite + TypeScript estricto, Tailwind (tokens de `src/index.css`), `node:test` vía `tsx --test`. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-21-fusion-vision-toolcrib-design.md` (Fase 1). Las Fases 2 a 4 (planos, config por cuenta, apagar Vision) tendrán su propio plan cuando esta se use.

## Global Constraints

- Interfaz toda en español; seguir `DESIGN.md` y los tokens existentes (`bg-card`, `border-border`, `font-mono-data`, `Badge`/`STATUS_VARIANT`). No introducir colores nuevos.
- Tool Crib = `partner_name` que contiene "SUPRAJIT" (misma regla que SMV Vision, `REPORT_PARTNER_KEY_PREFIX`).
- Se conserva `src/services/pendingItems.ts` (lo usan `OrdersTable`, `StatsDashboard`, `exportExcel`). Solo se borra `PendingTab.tsx`.
- Los links viejos `?vista=pending`, `?tab=pending`, `?tab=agenda`, `?vista=agenda` deben caer en Tool Crib.
- Sin IA, sin Firebase Storage, sin escrituras a Firestore en esta fase. No se despliega nada.
- Los textos de fecha de Odoo se parsean con `parseOdooDate`; nunca `new Date()` sobre strings crudos.
- Móvil y escritorio: respetar `useMobile()` (lista en móvil, tabla en escritorio), como hacía `PendingTab`.
- Cada commit lleva `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. No hacer push.

## Review Focus

- Nombre de cliente "Suprajit Mexico", "SUPRAJIT" o con espacios sobrantes: debe contar como Tool Crib sin importar mayúsculas.
- Partida sin corchetes en la descripción: se muestra con "Sin no. de parte"; nunca se oculta.
- Orden sin `lines` (solo `main_product`/`qty_total`): se muestra una partida sintética, igual que `getPendingLines`.
- Entregado de más (`delivered > qty`): faltan = 0, nunca negativo, y queda "entregada".
- Partida de servicio (descripción con "servicio"): no se lista, porque no lleva plano.
- Un `adminFilters` guardado en localStorage con `vista=pending` no rompe el Admin.
- Orden con solicitud pendiente de factura o remisión: todas sus partidas salen como "solicitada".

---

### Task 1: Lógica pura de Tool Crib

**Files:**
- Create: `src/services/toolCrib.ts`
- Test: `src/services/toolCrib.test.ts`

**Interfaces:**
- Consumes: `OdooSaleOrder`, `OdooOrderLine` (`src/services/odoo.ts`), `compareByUrgency` (`src/services/pendingItems.ts`), `InvoiceRequest` (`shared/invoiceRequests.ts`).
- Produces:
  - `TOOL_CRIB_PARTNER_KEY = 'SUPRAJIT'`
  - `isToolCribOrder(order: OdooSaleOrder): boolean`
  - `extractPartNumber(lineName: string): string | null`
  - `type ToolCribLineStatus = 'pendiente' | 'solicitada' | 'entregada'`
  - `interface ToolCribLine { order: OdooSaleOrder; line: OdooOrderLine; partNumber: string | null; missing: number; status: ToolCribLineStatus }`
  - `collectToolCribLines(orders: OdooSaleOrder[], requestsByOrder?: Map<number, InvoiceRequest[]>): ToolCribLine[]`

- [ ] **Step 1: Escribir las pruebas que fallan** en `src/services/toolCrib.test.ts`. Construir órdenes mínimas con un helper local `makeOrder(partial)` (copiar la forma de los helpers de `src/services/pendingItems.test.ts`). Pruebas, con sus aserciones exactas:
  - `isToolCribOrder`: `'SUPRAJIT MEXICO'` → true; `'Suprajit Mexico'` → true; `'  suprajit '` → true; `'BOSCH'` → false; `''` → false.
  - `extractPartNumber`: `'[ABC-123] Buje de bronce'` → `'ABC-123'`; `'[ ABC-123 ] x'` → `'ABC-123'` (recortado); `'Buje sin corchetes'` → null; `'[] vacío'` → null.
  - `collectToolCribLines` con una orden Suprajit de 2 partidas (qty 10 entregado 4, y qty 5 entregado 5): devuelve 2 líneas, la primera `missing: 6, status: 'pendiente'`, la segunda `missing: 0, status: 'entregada'`.
  - Mismo caso con `requestsByOrder = new Map([[orden.id, [requestPendienteStub]]])`: ambas líneas `status: 'solicitada'`.
  - Entregado de más (qty 5, delivered 7): `missing: 0`, `status: 'entregada'`.
  - Orden Suprajit sin `lines` (arreglo vacío): una línea sintética con `line.name === order.main_product`, `line.qty === order.qty_total`, `line.delivered === order.qty_delivered`.
  - Partidas `'SERVICIO DE MAQUINADO'` y `'Servicio de corte'`: no aparecen.
  - Orden de `BOSCH`: no aparece.
  - Orden: las partidas de la orden más urgente (`compareByUrgency`) van primero; dentro de una orden se conserva el orden de Odoo. Con dos órdenes Suprajit, una vencida y otra a tiempo, las partidas de la vencida salen primero.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/toolCrib.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Implementar `src/services/toolCrib.ts`** con las firmas de Interfaces. Notas que la firma no determina: la comparación de cliente es `partner_name.toLocaleUpperCase('es-MX').includes(TOOL_CRIB_PARTNER_KEY)`; el número de parte sale de `/^\[(.*?)\]/` con `trim()` y vacío → null; el filtro de servicio es `/servicio/i` sobre `line.name`; las líneas salen de `order.lines` y, si está vacío o ausente, de la partida sintética (mismo criterio que `getPendingLines`; no reutilizarlo porque descarta las entregadas); `status` = `'solicitada'` si `requestsByOrder?.get(order.id)?.length`, si no `'entregada'` cuando `missing === 0`, si no `'pendiente'`. Ordenar las órdenes con `compareByUrgency` (estable).

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx tsx --test src/services/toolCrib.test.ts`
Expected: PASS, todas las pruebas.

- [ ] **Step 5: Commit**

```bash
git add src/services/toolCrib.ts src/services/toolCrib.test.ts
git commit -m "feat(toolcrib): lógica pura de partidas Tool Crib"
```

---

### Task 2: Sección `toolcrib` en filtros y secciones del Admin

**Files:**
- Modify: `src/services/adminFilters.ts` (`ORDER_VIEWS`, `parseAdminFilters`)
- Modify: `src/services/adminSections.ts` (`AdminSectionId`, `ADMIN_SECTIONS`, `MOBILE_PRIMARY_SECTIONS`)
- Test: `src/services/adminFilters.test.ts`, `src/services/adminSections.test.ts`

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces: `OrderView = 'company' | 'toolcrib'`; `AdminSectionId = 'company' | 'toolcrib' | 'requests' | 'config'`; la sección `{ id: 'toolcrib', label: 'Tool Crib', shortLabel: 'Tool Crib', group: 'orders', hasToolbar: true }`; `MOBILE_PRIMARY_SECTIONS = ['company','toolcrib','requests']`; el link serializado es `vista=toolcrib`.

- [ ] **Step 1: Actualizar las pruebas existentes y agregar las nuevas.** En ambos archivos de prueba reemplazar cada `'pending'` que se refiere a la vista por `'toolcrib'` (y `'?vista=pending'` por `'?vista=toolcrib'` donde se afirma la salida serializada). Agregar:
  - `parseAdminFilters` con `tab=pending`, `tab=agenda&q=x`, `vista=agenda`, `vista=pending` → `view: 'toolcrib'` en los cuatro casos (y `tab: 'orders'`).
  - `parseAdminFilters(new URLSearchParams('vista=toolcrib')).view === 'toolcrib'`.
  - `serializeAdminFilters({ ...DEFAULT_ADMIN_FILTERS, view: 'toolcrib' }).toString() === 'vista=toolcrib'`.
  - `adminSectionHref('toolcrib', null) === '/admin?vista=toolcrib'`.
  - Los links legados en `adminSections.test.ts` (`tab=pending`, `tab=agenda`) marcan la sección `'toolcrib'`.

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx tsx --test src/services/adminFilters.test.ts src/services/adminSections.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar.** En `adminFilters.ts`: `ORDER_VIEWS = ['company', 'toolcrib']`; en `parseAdminFilters`, `legacyView` pasa a `'toolcrib'` (para `tab=pending|agenda`) y los valores `vista=pending` y `vista=agenda` también producen `'toolcrib'`. Actualizar el comentario de cabecera si menciona Pendientes. En `adminSections.ts`: sustituir `'pending'` por `'toolcrib'` en el tipo, en la lista (etiqueta "Tool Crib") y en `MOBILE_PRIMARY_SECTIONS`.

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx tsx --test src/services/adminFilters.test.ts src/services/adminSections.test.ts`
Expected: PASS. (`npm run lint` fallará hasta la Task 3 porque `AdminPanel.tsx` aún usa `'pending'`; es esperado.)

- [ ] **Step 5: Commit**

```bash
git add src/services/adminFilters.ts src/services/adminSections.ts src/services/adminFilters.test.ts src/services/adminSections.test.ts
git commit -m "feat(admin): sección Tool Crib sustituye a Pendientes en filtros y navegación"
```

---

### Task 3: Componente `ToolCribTab` y cableado en el Admin

**Files:**
- Create: `src/components/admin/ToolCribTab.tsx`
- Modify: `src/pages/AdminPanel.tsx` (import línea ~43, render ~692, `LoadingState` ~852)
- Modify: `src/pages/StatsDashboard.tsx:307`
- Delete: `src/components/admin/PendingTab.tsx`

**Interfaces:**
- Consumes: `collectToolCribLines`, `ToolCribLine`, `ToolCribLineStatus` (Task 1); `'toolcrib'` (Task 2); en `AdminPanel` ya existen `filteredOrders`, `getEngineerName`, `setDetailOrder`, `setContextMenu`, `density`, `pendingByOrder` (`Map<number, InvoiceRequest[]> | undefined`).
- Produces: `export default function ToolCribTab(props: { orders: OdooSaleOrder[]; pendingByOrder?: Map<number, InvoiceRequest[]>; getEngineerName: (o: OdooSaleOrder) => string | null; onOrderClick?: (o: OdooSaleOrder) => void; onOrderContextMenu?: (e: React.MouseEvent, o: OdooSaleOrder) => void; density?: TableDensity })`.

- [ ] **Step 1: Crear `ToolCribTab.tsx`** tomando `PendingTab.tsx` como base de estilo y estructura (mismo `EmptyState`, `Badge`, `OrderPoEngineer`, tabla en escritorio y lista en móvil, mismos tokens y paddings por densidad). Diferencias: (a) no agrupa por cliente: lista plana de `collectToolCribLines(orders, pendingByOrder)`; (b) tres KPIs arriba: "Piezas pendientes" (suma de `missing`), "Listas para pedir factura o remisión" (líneas `entregada`) y "Solicitudes en curso" (órdenes distintas con líneas `solicitada`); (c) columnas: SO, PO / Ingeniero, No. de parte (`partNumber ?? 'Sin no. de parte'`, tono atenuado cuando es null), Producto (`abbreviate(line.name)`), Faltan, Compromiso, Estado de la partida, Impreso (texto fijo "—"; la Fase 2 lo llena); (d) el estado de la partida es un `Badge` con etiqueta "Pendiente" / "Solicitada" / "Entregada" (usar la variante existente de `Badge` más cercana; no crear variantes nuevas), y el estado de urgencia de la orden sigue visible como en `PendingTab` (columna aparte en escritorio; junto a la fecha en móvil). Vacío: `EmptyState` con título "Sin órdenes de Tool Crib con los filtros actuales". Fila clicable → `onOrderClick` (abre el detalle, que ya tiene "Pedir factura o remisión"); clic derecho → `onOrderContextMenu`. Sin selección múltiple en esta fase (queda para la Fase 2, donde se usa para imprimir por lote).

- [ ] **Step 2: Cablear en `AdminPanel.tsx`.** Cambiar el import a `ToolCribTab`; en el render, `view === 'toolcrib' ? <ToolCribTab orders={filteredOrders} pendingByOrder={pendingByOrder} getEngineerName=… onOrderClick={setDetailOrder} onOrderContextMenu={mismo handler} density={density} />`; en `LoadingState` cambiar el tipo a `view: 'company' | 'toolcrib'` y la condición, conservando el esqueleto actual (no rediseñarlo). Buscar cualquier otra referencia a `'pending'` con `grep -n "pending" src/pages/AdminPanel.tsx` y corregirla; no tocar `pendingByOrder` ni `invoiceRequests`.

- [ ] **Step 3: Retargetear el KPI de Stats.** En `StatsDashboard.tsx:307` cambiar `href="/admin?vista=pending"` por `href="/admin"` (era un KPI de todos los clientes; Tool Crib solo cubre Suprajit, y la tabla de Órdenes ya trae la columna "Qué falta").

- [ ] **Step 4: Borrar `PendingTab.tsx`** con `git rm src/components/admin/PendingTab.tsx` y confirmar con `grep -rn "PendingTab" src` que no queda ninguna referencia.

- [ ] **Step 5: Verificar tipos y pruebas**

Run: `npm run lint`
Expected: sin errores de TypeScript.
Run: `npm test`
Expected: todo PASS (incluidas las pruebas nuevas de Tasks 1 y 2).

- [ ] **Step 6: Verificar en el navegador** con `preview_start` sobre el servidor de desarrollo (`npm run dev:full`, con `DEV_AUTH_BYPASS=true` en `.env.local`). Comprobar con evidencia (`read_page` o captura):
  - `/admin?vista=pending`, `/admin?tab=pending` y `/admin?tab=agenda` terminan mostrando la sección activa "Tool Crib" y solo órdenes de Suprajit.
  - Sidebar y barra móvil (`resize_window` a mobile) muestran "Tool Crib" en lugar de "Pendientes".
  - Una orden con solicitud pendiente muestra sus partidas como "Solicitada".
  - Con el filtro de cliente en otro cliente, aparece el estado vacío.
  - Sin errores en la consola (`read_console_messages` con `onlyErrors`).
  Si Odoo no está accesible en local, decirlo y verificar con los datos que haya; no inventar resultados.

- [ ] **Step 7: Commit**

```bash
git add -A src/components/admin/ToolCribTab.tsx src/components/admin/PendingTab.tsx src/pages/AdminPanel.tsx src/pages/StatsDashboard.tsx
git commit -m "feat(admin): vista Tool Crib reemplaza a Pendientes"
```

---

## Self-review

- **Cobertura del spec (Fase 1):** constante y regla Suprajit (T1), sección y redirects (T2), borrar `PendingTab` conservando `pendingItems` (T3), columnas SO/PO/no. de parte/descripción/faltan/compromiso/estado (T3), estado derivado puro y probado (T1), columna Impreso con "—" (T3), `OrderPoEngineer` y detalle con solicitud reutilizados (T3). La verificación del spec (`/admin?vista=pending` cae en Tool Crib) está en T3 paso 6.
- **Decisiones mías, a revisar:** (1) la vista lista también las partidas ya entregadas sin solicitud, porque son las que están listas para pedir factura o remisión; el spec decía solo "con cantidad pendiente" pero sus estados incluyen "entregada"; (2) la solicitud se evalúa por orden, no por partida; (3) NO se ocultan partidas de servicio: la revisión final mostró que Vision no las excluye y un filtro por texto escondería piezas reales; (4) la selección múltiple y el pedido por lote pasan a la Fase 2; (5) el KPI de Stats ya no apunta a Tool Crib.
- **Consistencia de tipos:** `ToolCribLineStatus`, `ToolCribLine` y `collectToolCribLines` se definen en T1 y se usan con ese nombre en T3; `'toolcrib'` en T2 y T3.
