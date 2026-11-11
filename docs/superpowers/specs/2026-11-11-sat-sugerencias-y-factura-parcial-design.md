# Sugerencias de clave SAT para OHD y factura parcial para Fisher y Kohler

Fecha: 2026-11-11 · Estado: borrador para revisión · Alcance: solicitudes de factura/remisión (`RequestDialog`, `shared/invoiceRequests.ts`, correo a facturación).

## Objetivo y entendimiento acordado

1. **Clave SAT (solo OHD).** Hoy el diálogo sugiere la clave de cada partida con las palabras clave del Excel de Mary (`shared/satOhd.ts`, 62 claves). Cuando la lista de Mary no sugiere nada, el ingeniero debe poder recibir candidatas del catálogo SAT oficial según la descripción, elegir una, y que el correo a Mary la marque como "fuera de la lista de OHD, validar". Sin IA (Gemini se retiró de esta app el 2026-10-02 y no se reintroduce).
2. **Factura parcial (solo Fisher y Kohler).** Estas dos compañías pueden pedir factura completa, factura parcial (partidas y cantidades con +/−) o remisión. Los demás clientes siguen con factura completa o remisión. La clave SAT **no** aplica a Fisher ni Kohler: sigue siendo exclusiva de OHD.

Criterios de éxito: ver "Pruebas". Las dos partes son independientes y se pueden desplegar por separado (primero la parte 1, después la 2).

Fuera de alcance: corregir las 4 asignaciones dudosas del Excel de Mary (guardas de acrílico → 31133706, guarda de lexan → 24141500, programación de estación → 32151700, automatización → 32151900). Se le entrega la lista a Mary; la clave correcta es decisión fiscal. Tampoco se traduce inglés→español: las descripciones de OHD están en español.

## Parte 1 — Sugerencias de clave SAT (solo OHD)

### Datos
- `shared/satCatalogData.ts` (generado): `export const SAT_CATALOG: ReadonlyArray<readonly [clave: string, descripcion: string]>` con las claves de las divisiones 23, 24, 26, 27, 30, 31, 32, 39, 40, 41, 43, 56, 72, 73 y 81 del catálogo oficial (`phpcfdi-10.16.20260903`, 12,152 claves, ~600 KB). Se genera con `scripts/build-sat-catalog.mjs <ruta al catalogo.json del Hub>`; el archivo generado se versiona. Una división nueva se agrega editando la lista del script y regenerando.
- Cliente: se carga con `import()` dinámico solo al abrir un diálogo con una orden de OHD, para no engordar el paquete principal. Servidor (`server.ts` y Functions): importación estática para validar. `functions/tsconfig.json` ya incluye `../shared/**/*`; al ser `.ts` no requiere `resolveJsonModule`.

### Buscador (`shared/satSearch.ts`, lógica pura)
`suggestSatCandidates(description: string, limit = 3): Array<{ code; name; score }>`.
- Normaliza como `satOhd.ts` (mayúsculas, sin acentos ni signos; extraer ese `normalize` a un módulo compartido en vez de duplicarlo).
- Quita medidas, números y códigos de la descripción; descarta palabras genéricas (de, para, con, pieza, fab, diseño…).
- Puntúa cada clave por coincidencia de palabras (raíz simple: quita "S"/"ES" final) y por frase contigua; palabra específica pesa más que genérica; coincidencia de una sola palabra genérica no cuenta.
- Devuelve hasta 3 candidatas con score mínimo; si ninguna lo alcanza, devuelve `[]` (no se inventa nada).
- Basado en el buscador del Hub (`lib/sat/buscar.ts`) sin glosario inglés, historial, caché ni Gemini.

### Diálogo (`RequestDialog.tsx`, `SatSelect`)
Por partida de OHD:
1. Si `suggestSatOhdCode` (lista de Mary) devuelve clave → igual que hoy.
2. Si no → se llama a `suggestSatCandidates`; el selector muestra una sección "Sugeridas del catálogo SAT (fuera de la lista de OHD)" con hasta 3 candidatas (clave · nombre oficial) y, debajo, la lista de Mary. Nada queda preseleccionado: el ingeniero elige.
3. Si el ingeniero elige una clave que no está en la lista de Mary, se muestra el texto "Fuera de la lista de OHD: Mary la validará".
El estado `sat` por partida sigue siendo `Record<lineId, code>`; "fuera de lista" se deriva de `isSatOhdCode(code)`.

### Servidor y correo
- `attachSatKeys` (`shared/invoiceRequests.ts`): acepta una clave si está en la lista de Mary **o** existe en `SAT_CATALOG`; si no, rechaza con motivo. `SatKey` gana `inList: boolean` (guardado, no calculado en el correo).
- `parseRequest`/`parseSatKeysBody` aceptan y validan `inList` opcional (ausente = `true`, compatible con solicitudes ya guardadas).
- `buildRequestsEmail`: si `inList === false` agrega ` (fuera de la lista de OHD, validar)` tras `Clave SAT <código>` (texto y HTML).
- Los demás clientes no se tocan: siguen sin `satKeys`.

## Parte 2 — Factura parcial (solo Fisher y Kohler)

### Regla de elegibilidad
`allowsPartialInvoice(partnerName)` en `shared/invoiceRequests.ts`: `/\b(fisher|kohler)\b/i`, mismo estilo que `isOhdPartner`. Una sola fuente de verdad para cliente y servidor.

### Datos de Odoo
- `shared/odooClient.ts`: leer `qty_invoiced` de `sale.order.line` y exponer `invoiced: number` en cada partida (`OdooOrderLine.invoiced?` en `src/services/odoo.ts`; `RequestableOrder.lines[].invoiced?`). Es una lectura nueva del campo estándar, sin escribir en Odoo. Conversión de unidades igual que `qty` (el campo ya viene en la UoM de la línea).
- Si el campo falta o no es numérico, se trata como 0 (conservador: no oculta pendientes).

### Modelo
- Para Fisher/Kohler, **toda** factura se guarda con `lines` (la "factura completa" es una parcial con todas las cantidades pendientes). Los demás clientes: factura sin `lines`, como hoy. Así no existe una factura "sin líneas" que haya que reconciliar con parciales.
- `InvoiceRequestLine` gana `invoicedAtRequest?: number` (equivalente a `deliveredAtRequest`) para no descontar dos veces lo que Odoo facture después.
- `lineInvoiceRemaining(line, pendingForOrder)`: `max(0, qty − invoiced − Σ pedidas en facturas parciales pendientes de esa partida)`, donde cada pedida pendiente se reduce en lo que Odoo ya haya facturado desde `invoicedAtRequest`. Misma estructura que `lineRemainingQty` de remisiones.
- `RequestDraft` de `factura` admite `lines?: Array<{lineId, qty}>`. `parseCreateRequestsBody` lo parsea con las mismas reglas de remisión.
- Validación en `buildRequest`: si el cliente `allowsPartialInvoice` → `lines` obligatorias, cada cantidad ≤ `lineInvoiceRemaining`, sin partidas repetidas, mismas razones en español que remisión. Si no lo es y llegan `lines` → rechazo con motivo ("Este cliente solo factura la orden completa").
- Duplicados: la regla "ya hay una factura pendiente" solo aplica a clientes sin factura parcial. Para Fisher/Kohler se permiten varias facturas pendientes mientras haya cantidad por pedir; el límite global `MAX_PENDING` se conserva.

### Diálogo
- `requestAvailability` y `OrderRequestCard`: para Fisher/Kohler, el botón "Factura" despliega la lista de partidas con +/− (reutilizar el bloque de remisión) y un atajo "Toda la orden" que pone todas las cantidades al máximo. Disponibilidad `factura` = null si queda cantidad facturable; si no, "Ya está todo facturado o pedido".
- Para otros clientes el comportamiento actual no cambia.
- `buildDrafts`/`OrderChoice`: la factura de Fisher/Kohler reutiliza `lineQty`.

### Correo y pestaña Solicitudes
- `buildRequestsEmail`: una factura con `lines` ya imprime la lista de piezas con `pieces()`; se rotula la cabecera con " (parcial)" cuando `lines` existe.
- `RequestsTab` muestra las piezas de una factura parcial igual que las de una remisión.

## Manejo de errores
- Catálogo SAT no carga en el cliente (import dinámico falla): el selector cae a la lista de Mary, sin sugerencias nuevas, con aviso discreto; el envío no se bloquea por eso. El servidor siempre valida.
- Servidor sin `qty_invoiced`: ver "Datos de Odoo".
- Toda validación del servidor devuelve un motivo en español en `skipped`, como hoy.

## Pruebas (`node:test`, primero la prueba, después el código)
**Parte 1:** `satSearch` (descripción real de OHD → candidatas esperadas; palabra genérica sola no sugiere; sin acentos/plural; límite 3; vacío); `attachSatKeys` (clave del catálogo fuera de la lista se acepta con `inList: false`; clave inexistente se rechaza; de la lista `inList: true`); compatibilidad de solicitudes guardadas sin `inList`; correo con y sin marca; script/archivo generado: claves de 8 dígitos, sin duplicados, divisiones esperadas.
**Parte 2:** `allowsPartialInvoice`; `lineInvoiceRemaining` (descuenta facturado en Odoo y facturas parciales pendientes; no descuenta dos veces tras `invoicedAtRequest`); creación de facturas parciales sucesivas; rechazo de `lines` en clientes no elegibles; rechazo de factura sin `lines` para Fisher/Kohler; cantidad excedida; correo "(parcial)"; los demás clientes no cambian (regresión de las pruebas actuales).
**Cierre:** `npm run lint`, `npm test`, compilación de Functions. Verificación en navegador con sesión real queda pendiente de que Emiliano pruebe con una orden de OHD, una de Fisher/Kohler y una de otro cliente.

## Riesgos
- Una sugerencia que "parece buena" y no lo es (como "acrílico" → recubrimiento conformal). Mitigación: solo propone, muestra el nombre oficial, nunca preselecciona y el correo marca "validar".
- Leer `qty_invoiced` agrega un campo a la consulta de Odoo; se verifica contra la instancia real antes de desplegar la parte 2.
- Tamaño del paquete: el catálogo recortado (~600 KB) va por carga diferida y solo para OHD.

## Orden de entrega
1. Parte 1 (catálogo, buscador, diálogo, servidor, correo) → despliegue.
2. Parte 2 (Odoo `qty_invoiced`, modelo, diálogo, correo) → despliegue.
Cada parte actualiza `CLAUDE.md` en la sección "Solicitudes de factura o remisión".
