# Parte 2 — Factura parcial para Fisher y Kohler: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fisher y Kohler pueden pedir factura completa, factura parcial (partidas y cantidades con +/−) o remisión; los demás clientes siguen igual. Sin claves SAT para ellos.

**Architecture:** Para Fisher/Kohler toda factura se guarda con `lines` (la "completa" es una parcial con todo lo pendiente). Odoo aporta `qty_invoiced` por partida; el descuento de facturas pendientes replica la mecánica de remisiones (`lineRemainingQty`, `deliveredAtRequest`) con `lineInvoiceRemaining` e `invoicedAtRequest`. El diálogo reutiliza el bloque de partidas de la remisión.

**Tech Stack:** TypeScript estricto, `node:test` vía `tsx --test`, React 19 + Vite, Firebase Functions (commonjs).

**Spec:** `docs/superpowers/specs/2026-11-11-sat-sugerencias-y-factura-parcial-design.md` (sección "Parte 2"). Independiente de la Parte 1; si se ejecuta después, `SatKey`/`attachSatKeys` ya tendrán `inList` y no se tocan aquí.

## Global Constraints

- Elegibilidad: `allowsPartialInvoice(partnerName)` = `/\b(fisher|kohler)\b/i`; única fuente de verdad (cliente y servidor).
- Fisher/Kohler **no** llevan `satKeys` (solo OHD).
- Fisher/Kohler: toda factura lleva `lines` (obligatorias, cantidad > 0, ≤ `lineInvoiceRemaining`, sin partidas repetidas). Otros clientes: factura sin `lines`; si llegan, motivo `Este cliente solo factura la orden completa.`
- Duplicados: la regla "ya hay factura pendiente" solo aplica a clientes sin factura parcial; para Fisher/Kohler se permiten varias mientras quede cantidad. El tope `MAX_PENDING` (300) se conserva.
- `qty_invoiced` se lee de Odoo (solo lectura); ausente o no numérico = 0.
- Correo: cabecera de factura con `lines` rotulada ` (parcial)`.
- Sin IA, sin commit/push/deploy sin que el usuario lo pida. Verificar `qty_invoiced` contra Odoo real antes de desplegar.
- Estilo del repo: motivos de rechazo en español, `npm run lint` = `tsc --noEmit`; Functions: `cd functions && npx tsc --noEmit -p .`.

## Review Focus

1. Factura parcial pedida, Odoo la factura después, y se pide otra: no se descuenta dos veces (`invoicedAtRequest`). (Task 1)
2. Orden de Fisher/Kohler totalmente facturada en Odoo → "Ya está todo facturado o pedido", sin botón de factura. (Tasks 1 y 3)
3. Partida con `qty_invoiced` mayor que `qty` (nota de crédito, redondeo) → restante 0, nunca negativo. (Task 1)
4. Solicitud de factura antigua de Fisher/Kohler sin `lines` (guardada antes) sigue leyéndose y se trata como "toda la orden pedida": bloquea otra factura completa pero no rompe la pestaña Solicitudes. (Task 1)
5. Odoo sin el campo `qty_invoiced` (instancia distinta o error) → `invoiced` 0 y la pantalla funciona. (Task 2)

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `shared/invoiceRequests.ts` (modifica) | `allowsPartialInvoice`, `lineInvoiceRemaining`, `invoicedAtRequest`, validación y duplicados |
| `shared/odooClient.ts`, `src/services/odoo.ts` (modifican) | `invoiced` por partida |
| `src/services/invoiceDrafts.ts` (modifica) | disponibilidad y borradores de factura parcial |
| `src/components/RequestDialog.tsx` (modifica) | lista +/− para factura de Fisher/Kohler |
| `shared/invoiceRequest.ts`, `src/components/admin/RequestsTab.tsx` (modifican) | rótulo "(parcial)" |

---

### Task 1: Modelo y validación en el servidor

**Files:**
- Modify: `shared/invoiceRequests.ts`
- Test: `shared/invoiceRequests.test.ts`

**Interfaces:**
- Produces:
  `export const allowsPartialInvoice: (partnerName: string) => boolean`
  `export function lineInvoiceRemaining(line: { id: number; qty: number; invoiced?: number }, pending: InvoiceRequest[]): number` — `max(0, qty − invoiced − Σ pedidas pendientes de esa partida en facturas con `lines`)`, donde cada pedida pendiente se reduce en `max(0, invoiced − invoicedAtRequest)` (lo que Odoo ya facturó desde que se pidió) y nunca baja de 0. Misma estructura que `lineRemainingQty` de remisiones: copiar su forma y cambiar `delivered`→`invoiced`.
  `InvoiceRequestLine` gana `invoicedAtRequest?: number`.
  `RequestDraft` (tipo `factura`) gana `lines?: Array<{ lineId: number; qty: number }>`; `RequestableOrder.lines[]` gana `invoiced?: number`.
  `parseCreateRequestsBody` parsea `lines` de factura con las mismas reglas que remisión.
- Una factura guardada sin `lines` de un cliente Fisher/Kohler (histórica) cuenta como pedido total: `lineInvoiceRemaining` devuelve 0 para todas las partidas de esa orden mientras esté pendiente (Review Focus 4).

Reglas en `buildRequest` (factura): cliente `allowsPartialInvoice` → exigir `lines`, validar cada cantidad contra `lineInvoiceRemaining`, rechazar repetidas, guardar `lines` con `deliveredAtRequest` (como hoy en remisión) e `invoicedAtRequest`; cliente no elegible con `lines` → `Este cliente solo factura la orden completa.`; sin `satKeys` para Fisher/Kohler. Duplicados: omitir la regla "ya hay una factura pendiente" para elegibles; si no queda cantidad facturable en ninguna partida → motivo `Ya está todo facturado o pedido.`

- [ ] **Step 1: Write the failing tests** (con órdenes sintéticas `fisher` y `bosch`, partidas `{id, qty, invoiced}`):
  - `'allowsPartialInvoice: Fisher y Kohler sí, los demás no'`: `'Fisher Controls'`, `'KOHLER'` → true; `'OHD'`, `'Bosch'`, `'Fisherman Co'` → false (`\b` cubre el último caso: verificar que `Fisherman` es false).
  - `'lineInvoiceRemaining: descuenta facturado y pendientes'`: qty 10, invoiced 3, pendiente pidió 4 → 3.
  - `'no descuenta dos veces tras facturarse' ` (Review Focus 1): qty 10, invoiced 7 ahora, pendiente pidió 4 con `invoicedAtRequest: 3` → restante = 10 − 7 − max(0, 4 − (7−3)) = 3.
  - `'invoiced mayor que qty no da negativo'` (Review Focus 3): qty 5, invoiced 8 → 0.
  - `'Fisher: factura parcial sucesiva'`: pedir 4 de 10, luego 6 → ambas creadas; pedir 1 más → `skipped` con motivo de cantidad excedida.
  - `'Fisher: factura sin lines se rechaza'` y `'no elegible: factura con lines se rechaza con motivo exacto'`.
  - `'Fisher: sin satKeys aunque lleguen'`: el body trae `satKeys` → la solicitud guardada no los tiene.
  - `'Fisher: orden facturada por completo'` (Review Focus 2): todas las partidas `invoiced === qty` → `skipped` `/todo facturado/`.
  - `'factura histórica sin lines bloquea una completa'` (Review Focus 4): estado con factura pendiente de Fisher sin `lines` → nueva factura rechazada; `normalizeInvoiceRequests` la sigue aceptando.
  - Regresión: las pruebas actuales de OHD/Bosch (factura sin `lines`, un solo pendiente) siguen pasando sin cambios.
- [ ] **Step 2: Run** `npx tsx --test shared/invoiceRequests.test.ts` → FAIL.
- [ ] **Step 3: Implement** lo anterior en `shared/invoiceRequests.ts` (cada cantidad se valida igual que remisión: entera o decimal positivo ≤ restante, mismas razones en español).
- [ ] **Step 4: Run** `npx tsx --test shared/invoiceRequests.test.ts` + `npm run lint` + `cd functions && npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5: Commit** `feat(solicitudes): factura parcial para Fisher y Kohler en el servidor`.

---

### Task 2: `qty_invoiced` desde Odoo

**Files:**
- Modify: `shared/odooClient.ts` (campos de `sale.order.line`, `RawLine`, salida de `lines`, tipo de partida), `src/services/odoo.ts` (`OdooOrderLine.invoiced?`)
- Test: `shared/odooClient.test.ts`

**Interfaces:**
- Produces: cada partida de la orden expone `invoiced: number` (cantidad facturada en la UoM de la línea; `0` si falta, no es número o es negativa). Sin conversión de unidades adicional: `qty_invoiced` ya viene en la UoM de la línea.

- [ ] **Step 1: Write the failing test** (siguiendo el estilo de las pruebas existentes de `odooClient.test.ts` con un cliente de Odoo simulado): una línea con `qty_invoiced: 3` → `lines[0].invoiced === 3`; línea sin el campo → `0`; `qty_invoiced: 'x'` → `0` (Review Focus 5); `-2` → `0`.
- [ ] **Step 2: Run** `npx tsx --test shared/odooClient.test.ts` → FAIL.
- [ ] **Step 3: Implement:** añadir `'qty_invoiced'` a la lista de campos leídos de `sale.order.line`, al tipo `RawLine`, y mapear `invoiced` junto a `qty` en la salida; reflejarlo en el tipo de `src/services/odoo.ts`.
- [ ] **Step 4: Run** `npx tsx --test shared/odooClient.test.ts` + `npm run lint` → PASS.
- [ ] **Step 5: Verificación contra Odoo real (antes de desplegar):** con `.env.local` y `npm run server`, pedir `GET /api/odoo/invoiceable-orders` (con `DEV_AUTH_BYPASS=true`) y confirmar que una orden con factura parcial en Odoo trae `invoiced` coherente en sus partidas. Si el campo no existe en la instancia, detenerse y avisar al usuario: no inventar otra fuente.
- [ ] **Step 6: Commit** `feat(odoo): cantidad facturada por partida`.

---

### Task 3: Diálogo de factura parcial

**Files:**
- Modify: `src/services/invoiceDrafts.ts`, `src/components/RequestDialog.tsx`
- Test: `src/services/invoiceDrafts.test.ts`

**Interfaces:**
- Consumes: `allowsPartialInvoice`, `lineInvoiceRemaining` (Task 1); `invoiced` por partida (Task 2).
- Produces: `requestAvailability(order, pending)` devuelve para `factura` en Fisher/Kohler: `null` si alguna partida tiene `lineInvoiceRemaining > 0`; si no, `'Ya está todo facturado o pedido'`. Para el resto de clientes no cambia. `buildDrafts` genera, para una factura de Fisher/Kohler, `lines` desde `lineQty` (partidas con qty > 0) en lugar de omitirlas.

Comportamiento de UI: para Fisher/Kohler, al elegir "Factura" aparece la misma lista de partidas con +/− que la remisión, con máximo `lineInvoiceRemaining`, y un botón "Toda la orden" que pone todas las cantidades al máximo; enviar exige al menos una cantidad > 0. Para esos clientes no se muestra ningún selector SAT. Para los demás, el diálogo no cambia.

- [ ] **Step 1: Write the failing tests** en `invoiceDrafts.test.ts`: disponibilidad `factura` null/"Ya está todo facturado o pedido" según restante; `buildDrafts` de Fisher con `lineQty` `{31: 4, 32: 0}` → borrador `factura` con `lines: [{lineId:31, qty:4}]`; de un cliente no elegible sigue sin `lines`; de OHD sigue con `satKeys` y sin `lines`.
- [ ] **Step 2: Run** `npx tsx --test src/services/invoiceDrafts.test.ts` → FAIL.
- [ ] **Step 3: Implement** los cambios de `invoiceDrafts.ts` y reutilizar en `RequestDialog.tsx` el bloque de partidas de remisión para `factura` cuando `allowsPartialInvoice(order.partner_name)`; "Toda la orden" fija `lineQty[id] = lineInvoiceRemaining(...)` para cada partida. Mantener tamaños táctiles y tokens existentes.
- [ ] **Step 4: Run** `npx tsx --test src/services/invoiceDrafts.test.ts` + `npm run lint` + `npm test` → PASS.
- [ ] **Step 5: Verificación manual** (queda para el usuario si no hay sesión): una orden de Fisher/Kohler muestra la lista +/− en Factura y "Toda la orden"; una de OHD sigue pidiendo clave SAT; una de otro cliente no cambia.
- [ ] **Step 6: Commit** `feat(solicitudes): el diálogo permite factura parcial a Fisher y Kohler`.

---

### Task 4: Correo y pestaña Solicitudes

**Files:**
- Modify: `shared/invoiceRequest.ts`, `src/components/admin/RequestsTab.tsx`
- Test: `shared/invoiceRequest.test.ts`

**Interfaces:**
- Produces: en `buildRequestsEmail`, el encabezado de una factura con `lines` termina en ` (parcial)` (texto y HTML) y lista sus piezas con `pieces()`; una factura sin `lines` no cambia. `RequestsTab` rotula "Factura parcial" cuando `type === 'factura'` y trae `lines`.

- [ ] **Step 1: Write the failing tests:** factura con `lines` → `mail.text` coincide `/— Fisher.* \(parcial\)/` y lista `4 pza — …`; factura sin `lines` (OHD) → sin `(parcial)`; el asunto no cambia.
- [ ] **Step 2: Run** `npx tsx --test shared/invoiceRequest.test.ts` → FAIL.
- [ ] **Step 3: Implement** el rótulo en `head()` (según `r.type === 'factura' && r.lines?.length`) y la etiqueta en `RequestsTab.tsx`.
- [ ] **Step 4: Run** `npx tsx --test shared/invoiceRequest.test.ts` + `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(solicitudes): el correo y la pestaña rotulan la factura parcial`.

---

### Task 5: Documentación y cierre de la Parte 2

**Files:**
- Modify: `CLAUDE.md` (sección "Solicitudes de factura o remisión")

- [ ] **Step 1:** Añadir: elegibilidad (`allowsPartialInvoice`), toda factura de Fisher/Kohler lleva `lines`, `qty_invoiced`→`invoiced`, `lineInvoiceRemaining`/`invoicedAtRequest`, regla de duplicados distinta, y que SAT sigue solo para OHD.
- [ ] **Step 2: Verificación completa:** `npm run lint`, `npm test`, `cd functions && npx tsc --noEmit -p .` → sin errores, todas PASS.
- [ ] **Step 3: Commit** `docs: factura parcial para Fisher y Kohler`. Push y `npm run deploy` solo cuando el usuario lo pida, y solo tras la verificación contra Odoo real (Task 2, Step 5).
