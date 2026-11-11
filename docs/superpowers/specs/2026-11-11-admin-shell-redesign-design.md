# Rediseño del shell del Admin — diseño

Fecha: 2026-11-11 · Estado: en revisión · Proyecto 1 de 3

## Contexto y objetivo

`/admin` es la herramienta diaria del equipo de diseño y producción. Se usa sobre todo en compu; el celular sirve para consultas rápidas en el taller. Problemas actuales:

- Hasta 5 filas de controles apiladas antes de la primera orden: chips de ingeniero, chips de vista, filtros, selección y acciones (`src/pages/AdminPanel.tsx`, 455 líneas).
- El sidebar solo dice "Órdenes" y no refleja la pestaña activa (Entregas, Solicitudes, Configuración).
- No hay una versión móvil pensada: `AdminPanel` no usa `useMobile` y solo se acomoda con `flex-wrap`.
- El subtítulo "Solo lectura, desde Odoo" ya es falso, porque Configuración y Solicitudes escriben.

El pedido original también incluye mejorar Configuración. Se dividió en tres proyectos, cada uno con su spec, plan y entrega:

1. **Shell del Admin** (este documento). Solo frontend.
2. Configuración: horarios bien hechos (búsqueda, aviso de "Odoo manda" frente a manual, cualquier cliente, estados de carga y error, validaciones) y una vista de solo lectura de quién tiene acceso. Requiere un endpoint que lea usuarios del Hub.
3. Avisos de Discord editables sin redeploy. Toca las Functions programadas, las reglas y los permisos.

**Criterios de éxito**
- Entre el encabezado y la primera orden hay una sola fila de controles.
- Siempre se sabe en qué sección estás, en escritorio y en móvil.
- En un celular de 375 px se puede buscar y abrir una orden con el pulgar, sin scroll horizontal.
- Los links compartidos y los filtros guardados siguen funcionando.

## Fuentes y principios

Fuentes del segundo cerebro:
- `wiki/concepts/UI-UX-anti-slop-movil.md`
- `wiki/recursos/Frontend - componentes para diseno y rediseno.md`
- `wiki/recursos/Repos de diseno - guias para rediseno.md`
- `wiki/proyectos/Proyecto - Visual Factory TV Dashboard.md`
- las lecciones `claude-admin-odoo-console-redesign` y `claude-visual-factory-consistencia-ui-tokens`

En el repo, `DESIGN.md` y `src/index.css` (`@theme`) mandan.

Principios aplicados:
- Tab bar si hay 5 destinos o menos; nunca hamburguesa ni carrusel de pestañas.
- Borrar antes que agregar; nada importante solo en hover.
- Chrome consistente con tokens: sin hex ni RGBA sueltos, sin etiquetas en MAYÚSCULAS.
- Indigo como único acento, para la acción primaria.
- Íconos Lucide.
- Texto de al menos 12 px en Admin.
- Objetivos táctiles de al menos 44 px.

## Navegación y URL

### Escritorio (sidebar de `src/components/Layout.tsx`)

El ítem único "Órdenes" se reemplaza por secciones agrupadas. Los títulos de grupo van en tipo normal, no en MAYÚSCULAS.

| Grupo | Sección | `tab` | `vista` |
|---|---|---|---|
| Órdenes | Por compañía | `orders` | `company` |
| Órdenes | Pendientes | `orders` | `pending` |
| Órdenes | Agenda | `orders` | `agenda` |
| Órdenes | Entregas | `deliveries` | (ignorada) |
| Órdenes | Solicitudes (contador de pendientes) | `requests` | (ignorada) |
| Ajustes | Configuración | `config` | (ignorada) |

- Al final del sidebar quedan Estadísticas y TV en vivo, como hoy.
- La sección activa usa el indicador actual: `bg-primary/12`, barra primaria a la izquierda e ícono `text-primary`.

### Contrato de URL

No cambia. Las secciones son combinaciones existentes de `tab` + `vista` que ya entiende `src/services/adminFilters.ts`:
- `parseAdminFilters` sigue validando y mapeando los legados: `tab=pending|agenda` a la vista correspondiente, y `tab=report` a `orders` + `company`.
- Un link manipulado cae en Por compañía, que sigue siendo el default.
- La restauración desde `localStorage['adminFilters']` funciona igual.
- Al cambiar de sección se conservan `q`, `cliente`, `estado` e `ing`. Hoy se conservan entre pestañas y no cambia.
- Navegar entre secciones usa `replace: true`, igual que hoy, así que no se acumulan entradas en el historial.

Se eliminan las `Tabs` superiores de `AdminPanel` y la fila de chips de vista.

### Móvil (menos de 768 px, solo en `/admin`)

- La barra inferior global de `Layout.tsx` se reemplaza en `/admin` por una de 5 destinos: **Compañía · Pendientes · Agenda · Entregas · Más**.
- "Más" abre un `Drawer` con Solicitudes (con contador), Configuración, Estadísticas y TV en vivo.
- Si la sección activa está dentro de "Más", el botón "Más" se marca como activo.
- La barra usa tokens (`bg-card`, `border-border`) en lugar del `rgba(10,10,16,0.93)` actual y respeta la safe area inferior.
- `/stats` conserva la barra inferior actual.

### Encabezado de página

- Título: nombre de la sección.
- Subtítulo: "actualizado HH:mm".
- Botón "Actualizar" a la derecha.
- Se quita "Solo lectura, desde Odoo".

## Barra de controles y selección

### Escritorio

Aparece en Por compañía, Pendientes, Agenda y Entregas. Configuración y Solicitudes no la llevan.

```
[Buscar SO, PO, OT, ingeniero…        ] [Cliente ▾] [Estado ▾] [Ingeniero ▾]   [Excel] [Más ⋯]
42 de 124 órdenes · [Cliente: Bosch ×] [Ingeniero: Sin asignar ×]  Limpiar
```

- Buscador, Cliente y Estado salen de los controles actuales de `OrdersFilterBar`; se mueven, no se reescriben.
- **Ingeniero ▾** reemplaza la fila de chips con un select: "Todas (n)", una opción por persona del equipo "(n)" y "Sin asignar (n)". Usa los mismos conteos y el mismo filtro `ing` que hoy.
- **Excel** queda visible porque es la exportación de uso diario.
- **Más ⋯** es un menú (`ui/dropdown-menu.tsx`) con:
  - Copiar link;
  - Agrupar / Lista plana (solo donde hoy existe);
  - Imprimir / PDF.
- **Línea de estado:** el conteo "n de N órdenes", un chip removible por cada filtro activo y "Limpiar", que solo aparece si hay filtros activos.

### Selección

- La fila actual de selección pasa a ser una **barra fija abajo**, opaca (`bg-card`, `border-border`, `shadow-overlay`). Solo aparece con órdenes marcadas y solo donde hoy hay selección: la vista Por compañía.
- Contenido: "n seleccionadas", "Pedir factura o remisión" (primaria), y como secundarias "Asignármelas", "Excel" y "Quitar selección".
- La selección se limpia al cambiar de sección.

### Móvil

- Buscador a todo el ancho.
- Botón **"Filtros (n)"**, donde n es el número de filtros activos. Abre un `Drawer` con Cliente, Estado e Ingeniero, más las acciones de "Más" y Excel.
- La barra de selección se coloca encima de la barra inferior.

### Banners

Error de carga de Odoo, `TruncatedNotice` y error de sincronización del equipo: se quedan iguales, entre el encabezado y la barra.

## Piezas

| Archivo | Propósito | Depende de |
|---|---|---|
| `src/services/adminSections.ts` (nuevo, puro) | Lista de secciones (id, etiqueta, ícono Lucide, grupo); `sectionFromFilters(filters)`; `filtersForSection(section, filters)`; reparto móvil en destinos fijos y destinos de "Más" | `AdminFilters` de `adminFilters.ts` |
| `src/components/admin/AdminNav.tsx` (nuevo) | Secciones del sidebar en escritorio; barra inferior y Drawer "Más" en móvil | `adminSections`, `useSearchParams`, `useMobile`, `useInvoiceRequests` (caché compartida, sin petición extra), `Drawer` |
| `src/components/admin/AdminToolbar.tsx` (nuevo) | Fila de controles y línea de estado; Drawer de filtros en móvil | Controles de `OrdersFilterBar`, `dropdown-menu`, `Drawer`, `useMobile` |
| `src/components/admin/SelectionBar.tsx` (nuevo) | Barra fija de selección | `Button` |
| `src/components/ui/dropdown-menu.tsx` (nuevo) | Primitivo shadcn sobre `Menu` de `@base-ui/react` (ya instalado) | — |
| `src/components/Layout.tsx` (cambia) | Monta `AdminNav` cuando la ruta es `/admin`; en otras rutas, la navegación actual | `AdminNav` |
| `src/pages/AdminPanel.tsx` (cambia) | Queda como orquestador: datos, filtros, encabezado y contenido de la sección | Lo anterior |
| `src/index.css` (cambia) | Reglas `print:` que ocultan la barra de controles y la de selección | — |

No se agregan dependencias.

## Flujo de datos

Sin cambios funcionales:
- La URL es el estado, vía `useSearchParams` con `parseAdminFilters`/`serialize`.
- `useOdooOrders`, asignaciones (`fetchOrderAssignments`, `changeTeam`) y solicitudes (`useInvoiceRequests`) funcionan igual.
- El filtrado del lado del cliente (ingeniero, cliente, estado, búsqueda) se mantiene.

`AdminNav` vive en `Layout`, fuera de `AdminPanel`. Lee la sección desde la URL y navega con `setSearchParams`, sin estado compartido adicional.

## Estados vacíos y errores

- **Vacío por filtro:** "Ninguna orden coincide con estos filtros" y la acción "Limpiar filtros".
- **Vacío real:** el mensaje que hoy muestra cada vista, sin cambios.
- **Errores:** los banners actuales.
- **Link manipulado:** cae en Por compañía.

## Fuera de alcance

- El contenido interno de cada sección: tablas, tarjetas, Agenda, Entregas, Solicitudes y el contenido de Configuración (proyecto 2).
- Ajustes de Discord (proyecto 3).
- Endpoints, reglas de Firestore, datos y permisos.

## Pruebas y verificación

- **TDD, `src/services/adminSections.test.ts` primero:**
  - ida y vuelta sección ↔ filtros para las 6 secciones;
  - conservación de `q`, `cliente`, `estado` e `ing` al cambiar de sección;
  - legados (`tab=pending`, `tab=agenda`, `tab=report`) y defaults;
  - reparto móvil: 4 fijos más "Más", y "Más" activo cuando la sección vive ahí.
- `src/services/adminFilters.test.ts` sigue verde sin modificarse.
- **Gates:** `npm run lint` y `npm test`.
- **Navegador** (`npm run dev:full`), a 1440 px y a 375 px:
  - recorrer las 6 secciones;
  - copiar un link y reabrirlo;
  - filtrar y quitar chips;
  - seleccionar órdenes y abrir "Pedir factura o remisión" sin enviar;
  - vista previa de impresión.
  - Capturas de evidencia y repaso del checklist anti-slop y de los "Errores que ya cometimos" del vault.
