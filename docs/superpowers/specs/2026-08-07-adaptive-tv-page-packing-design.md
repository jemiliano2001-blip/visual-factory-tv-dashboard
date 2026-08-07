# Diseño: empaquetado adaptativo de páginas TV

**Fecha:** 2026-08-07  
**Estado:** aprobado para especificación; pendiente de revisión del documento y plan de implementación.

## Contexto

La vista TV agrupa las órdenes facturables de Odoo por `partner_name` y rota sus páginas cada diez segundos. La cuadrícula calcula dinámicamente `ordersPerPage` con el ancho y alto disponibles. Hoy, las páginas completas de una compañía se muestran correctamente, pero las últimas páginas parciales desperdician espacio. En pantallas con cuatro o más columnas existe un caso especial que divide la pantalla en dos mitades para dos compañías pequeñas; esas mitades son fijas y tampoco llenan las celdas restantes.

Las órdenes se cargan desde Odoo y ya están ordenadas por `commitment_date` y luego por `date_order`. La TV oculta las órdenes totalmente entregadas salvo el filtro explícito de entregadas. Estos criterios no cambian.

## Objetivo

Usar todas las celdas disponibles de una página TV sin perder la lectura por compañía:

- Las páginas completas de cada compañía permanecen intactas.
- Solo los sobrantes de las últimas páginas se combinan.
- Una página compartida identifica con claridad a cada compañía, conserva sus órdenes consecutivas y no usa mitades rígidas.
- La información de compra del cliente se consulta en el detalle de la orden, no en la tarjeta TV.

## Decisión visual

Se adopta un híbrido entre agrupación y flujo compacto:

- Una página exclusiva conserva el encabezado, logo y horario actuales de una compañía.
- Una página compartida usa el encabezado `MÚLTIPLES CLIENTES`.
- Las tarjetas compartidas fluyen en la misma cuadrícula completa. Cada una muestra un distintivo compacto de compañía, con logo cuando exista y texto como respaldo.
- Las órdenes de un mismo cliente ocupan un tramo consecutivo de la cuadrícula. No habrá encabezados de bloque a ancho completo porque consumirían una fila y reintroducirían espacios desperdiciados.
- Se conservan los dos ejes visuales de la tarjeta: progreso (cyan, emerald, fuchsia) y prioridad (badge y alerta vencida). El distintivo de compañía no compite con ellos.

## Algoritmo de páginas

La construcción se extrae a una función pura que recibe órdenes filtradas y la capacidad de una página (`ordersPerPage`).

1. Agrupar por compañía respetando el orden de primera aparición de las órdenes ya ordenadas por Odoo. Mantener el orden interno de cada grupo.
2. Por cada compañía, emitir cada bloque de tamaño exacto `ordersPerPage` como página exclusiva.
3. Reservar la porción menor a `ordersPerPage` como sobrante de esa compañía.
4. Después de todas las páginas exclusivas, consumir los sobrantes en orden, llenando cada página compartida hasta su capacidad.
5. Cada segmento de una página compartida tiene `{ company, orders }`. Si un sobrante no cabe completo, se toma el tramo que cabe y su resto inicia la siguiente página. Nunca se alternan tarjetas de compañías distintas dentro de un segmento.
6. Si no hay sobrantes, no se crean páginas compartidas. Si solo queda una compañía con menos de una página, se muestra como página exclusiva parcial, igual que hoy.

Ejemplo con capacidad de 10: A deja 6 órdenes, B deja 2 y C deja 8. Las páginas exclusivas de A, B y C se muestran primero. La primera página compartida contiene A×6, B×2 y C×2; la siguiente empieza con C×6.

## Componentes y datos

### Paginación TV

`TVDashboard` sustituye el emparejamiento de `smallCompanies` por páginas exclusivas y páginas compartidas compuestas por segmentos. Las páginas exclusivas continúan usando `CompanyTVSection` sin cambios funcionales.

La página compartida renderiza una sola cuadrícula de capacidad total, no dos columnas independientes. Cada tarjeta recibe una señal explícita de contexto compartido y, cuando aplica, el nombre y logo de compañía para el distintivo compacto.

El índice actual se sigue normalizando cuando cambian el tamaño de la cuadrícula, los filtros, la búsqueda o los datos de Odoo. La rotación, pausa, resaltado por voz y navegación por puntos mantienen sus contratos actuales.

### Detalle de orden

`OdooSaleOrder.customer_reference` ya está disponible desde Odoo. `OrderDetailsModal` añade una fila `OC cliente` cuando su valor no es nulo ni vacío, tanto en el diálogo de escritorio como en el drawer móvil. La tarjeta TV no gana este campo para proteger la jerarquía visual a 3–4 metros.

## Comportamiento ante datos incompletos

- Sin logo, el distintivo muestra el texto de la compañía.
- Sin `customer_reference`, la fila no se renderiza en el detalle.
- Con capacidad inválida o cero, el constructor usa una capacidad mínima de una tarjeta y no genera una división por cero.
- Los filtros y la regla de ocultar órdenes totalmente entregadas se aplican antes de agrupar y paginar.
- Los horarios provenientes de `company_configs` siguen siendo accesorios de las páginas exclusivas. Una falla al leerlos no debe impedir construir ni rotar páginas compartidas.

## Validación

- Verificar el constructor de páginas con capacidad variable y con: cero órdenes, una compañía parcial, una compañía exacta, varias compañías parciales, sobrantes que caben completos y sobrantes que deben dividirse.
- Confirmar que las páginas exclusivas preceden a las compartidas y que cada orden aparece una sola vez.
- Revisar en modo TV a 1920×1080 y en una capacidad menor; revisar también modo escritorio y móvil para confirmar que no cambia su agrupación con scroll.
- Comprobar filtros de cliente, texto, voz, entregadas y resaltado de PO durante un recálculo de páginas.
- Ejecutar `npm run lint` como puerta de compilación del proyecto.

## Fuera de alcance

- Cambiar las reglas de Firestore o solucionar permisos existentes de `company_configs`.
- Alterar los criterios Odoo de órdenes facturables, el refresco periódico o los cálculos de progreso y prioridad.
- Añadir precios, importes u otra información confidencial a la TV.
