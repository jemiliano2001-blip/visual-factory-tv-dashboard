# Rediseño del Admin: Consola Odoo

**Fecha:** 2026-06-12
**Estado:** Aprobado por el usuario (diseño validado en sesión de brainstorming)

## Contexto y motivación

El panel de admin actual es un CRUD de órdenes de trabajo sobre Firestore
(colección `work_orders`), construido cuando la app no tenía conexión a Odoo.
Hoy Odoo es la única fuente de verdad operativa: nadie captura órdenes en el
admin, y el Stats Dashboard grafica datos de Firestore que ya no reflejan la
realidad. El CRUD de Firestore es peso muerto.

**Decisión:** el admin se reescribe como una **consola de solo lectura sobre
Odoo** (los mismos datos que muestra la TV), conservando las funciones de IA
útiles y la configuración del sistema. Stats se re-apunta a Odoo. El CRUD de
Firestore se elimina.

### Alcance de datos confirmado

El admin y Stats trabajan sobre el **mismo dataset que la TV**: órdenes de
venta con `invoice_status = 'to invoice'` (estados `sale`/`done`). No se
agregan órdenes históricas ni cotizaciones. Cambio mínimo en el proxy.

## Arquitectura resultante

| Pieza | Antes | Después |
|---|---|---|
| TV (`/`) | Odoo | Odoo (sin cambios visibles) |
| Admin (`/admin`) | CRUD Firestore + IA | Consola read-only de Odoo + Config + IA |
| Stats (`/stats`) | Firestore (`work_orders`) | Odoo |
| Firebase | Auth + `work_orders` + `work_orders_history` + `company_configs` | Auth + solo `company_configs` |

Auth no cambia: sign-in anónimo al cargar (para que la TV pase las reglas de
Firestore al leer `company_configs`), Google sign-in para `/admin` y `/stats`
vía `ProtectedRoute`.

## Capa de datos compartida

### Hook `useOdooOrders()` — `src/hooks/useOdooOrders.ts` (nuevo)

Extrae el `useQuery` de React Query con polling que hoy vive dentro de
`TVDashboard.tsx`. Lo consumen TV, Admin y Stats con la misma query key, de
modo que las tres páginas comparten una sola petición y una sola caché.

Expone: `{ orders, total, lastUpdated, error, isLoading, isFetching, refetch }`.

### Proxy `server.ts` — extensión del endpoint existente

`GET /api/odoo/invoiceable-orders` ya lee todas las líneas de producto
(`sale.order.line`) para calcular `main_product`, `qty_total` y
`qty_delivered`. Cambio: incluir esas líneas en la respuesta normalizada,
por orden:

```ts
lines: Array<{
  name: string;           // descripción del producto
  qty: number;            // product_uom_qty
  delivered: number;      // qty_delivered
  price_unit: number;
  subtotal: number;       // price_subtotal
}>
```

Sin endpoints nuevos. La TV ignora el campo; el Admin lo usa para el detalle
expandible por fila.

### Tipos — `src/services/odoo.ts`

- `OdooSaleOrder` gana `lines: OdooOrderLine[]`.
- Nuevo tipo exportado `OdooOrderLine` con la forma de arriba.

## AdminPanel (reescritura completa)

`src/pages/AdminPanel.tsx` se reescribe. Dos pestañas; las acciones de IA
viven integradas en la pestaña de Órdenes, no en pestaña aparte.

### Pestaña Órdenes

Tabla TanStack (`@tanstack/react-table`) de órdenes Odoo:

- **Columnas:** fecha orden, fecha compromiso (badge "Vencida" vía
  `isOrderOverdue`), número SO, cliente, producto principal, progreso de
  entrega (`getDeliveryProgress`), monto (`formatCurrency`), vendedor,
  prioridad calculada (`getOrderPriority`).
- **Búsqueda** por texto libre (SO / cliente / producto).
- **Filtros:** por cliente (select con clientes únicos) y por estado
  (todas / vencidas / en tiempo).
- **Ordenamiento** por columna (TanStack sorting).
- **Fila expandible:** líneas de producto (campo `lines` nuevo) + acciones IA
  por orden (reporte cliente, predicción de riesgo).
- **Export a Excel** con `xlsx-js-style` (se conserva la dependencia y el
  polyfill de Node en Vite).
- **Se elimina:** crear/editar/borrar, edición masiva, selección de filas,
  drag de columnas, subida de archivos, análisis/generación de imágenes.

### Pestaña Configuración

Se conserva tal cual el CRUD de `company_configs` (horarios de entrega por
cliente). **La TV usa esta colección** para mostrar "Horario: …" en las
tarjetas — debe seguir funcionando sin cambios.

La gestión de logos de clientes queda **fuera de este rediseño**: el mapeo
sigue hardcodeado en `src/utils/customerLogos.ts`. Se anota como mejora
futura.

## Capa de IA (`src/services/ai.ts`)

Las funciones se re-tipan de `WorkOrder` a `OdooSaleOrder`. La adaptación
inversa que hoy hace `TVDashboard.tsx` (mapear Odoo → forma WorkOrder antes
de llamar `processVoiceCommand`) desaparece. Todos los prompts siguen
instruyendo respuesta en español.

| Función | Destino |
|---|---|
| `filterOrdersByNaturalLanguage` | Se queda — barra de búsqueda IA sobre la tabla del admin |
| `generateClientReport` | Se queda — acción por orden: email de avance al cliente |
| `predictOrderRisk` | Se adapta — sin historial; predice con campos de la orden (compromiso vs. avance de entrega, monto, antigüedad). Resultado **efímero**: estado React, no se persiste |
| `analyzeOrderAnomalies` | Se adapta — análisis **global del conjunto actual** (vencidas con 0% entrega, montos atípicos, clientes con acumulación). Botón global en la pestaña Órdenes |
| `generateShiftSummary` | Se queda en Stats, alimentado con órdenes Odoo |
| `processVoiceCommand` | Se queda (TV), re-tipado a `OdooSaleOrder` |
| `generateSpeech` | Se queda (TV), sin cambios |
| `extractOrdersFromFile` | **Se elimina** (su único fin era crear órdenes en Firestore) |
| `analyzeImage` | **Se elimina** |
| `generateVisualAid` | **Se elimina** |

## Stats Dashboard (re-apuntado)

`src/pages/StatsDashboard.tsx` consume `useOdooOrders()`. Misma estructura
visual (tarjetas + recharts), métricas honestas para datos Odoo:

- **Tarjetas:** total de órdenes por facturar, vencidas, % de entrega global
  (suma `qty_delivered` / suma `qty_total`), monto total por facturar.
- **Gráfica de distribución por prioridad calculada** (`getOrderPriority`:
  baja / normal / alta / crítica).
- **Gráfica vencidas vs. en tiempo.**
- **Top 5 clientes por monto** (`amount_total`), antes era por piezas.
- **Resumen de turno IA** + compartir por WhatsApp: se conservan.
- Desaparecen las gráficas de estado de producción (scheduled/production/
  quality/hold) — ese estado no existe en los datos de Odoo.

## Limpieza

Se elimina:

- `src/services/workOrders.ts` completo.
- Tipos `WorkOrder`, `WorkOrderHistory`, `ActionType`, `Priority`, `Status`
  de `src/types.ts` (la prioridad calculada de Odoo tiene su propio tipo
  inline en `odoo.ts`).
- Todo el código CRUD del AdminPanel actual (modales, bulk edit, drag,
  upload, imágenes).

`firestore.rules`: las reglas de `work_orders` y `work_orders_history` se
**cierran** (`allow read, write: if false`). Los datos viejos quedan en
Firestore, inaccesibles pero intactos — decisión reversible. Las reglas de
`company_configs` no cambian.

`CLAUDE.md` se actualiza: la sección "Two independent data sources" cambia de
sentido (Odoo = órdenes, Firestore = solo auth + config), y se eliminan las
referencias al CRUD y a las funciones de IA borradas.

## Manejo de errores y estados

- Admin y Stats reutilizan el patrón de la TV: banner "SIN CONEXIÓN A ODOO"
  cuando el proxy falla, skeletons durante la carga inicial, datos cacheados
  con timestamp de última actualización visible.
- Acciones IA: spinner por acción + mensaje de error inline/toast (patrón
  actual del admin).
- Si `GEMINI_API_KEY` falta, las acciones IA fallan con mensaje claro; la
  tabla y Stats siguen funcionando (la IA es opcional, los datos no).

## Verificación

- `npm run lint` (`tsc --noEmit`) como gate de compilación — el repo no tiene
  tests ni ESLint.
- Prueba manual con Playwright sobre `npm run dev:full`:
  1. TV (`/`) sigue mostrando órdenes con logos y horarios.
  2. `/admin` exige login Google; tras login muestra la tabla con datos
     reales, búsqueda y filtros funcionan, fila expandible muestra líneas.
  3. `/stats` grafica con datos de Odoo.
  4. Export a Excel descarga un archivo válido.
  5. Sin errores en consola del navegador.

## Fuera de alcance (mejoras futuras anotadas)

- Gestión de logos de clientes desde la UI (hoy en `customerLogos.ts`).
- Órdenes históricas / cotizaciones de Odoo (requeriría endpoints nuevos).
- Persistencia de predicciones de riesgo.
- Capa de curación manual de lo que muestra la TV (el usuario decidió no
  necesitarla).
