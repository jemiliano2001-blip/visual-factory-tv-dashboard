# Rediseño del shell del Admin — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `/admin` tenga secciones en el sidebar y en una barra inferior móvil, una sola fila de controles y una barra fija de selección, sin cambiar datos, endpoints ni el contrato de la URL.

**Architecture:**
- Un módulo puro, `src/services/adminSections.ts`, traduce entre sección y `AdminFilters`, y resuelve los chips de filtros activos.
- `AdminNav` (montado por `Layout`) lee y escribe la sección en la URL.
- `AdminToolbar` y `SelectionBar` reemplazan las 5 filas actuales de `AdminPanel`.
- `AdminPanel` queda como orquestador de datos y contenido.

**Tech Stack:** React 19, react-router-dom (`useSearchParams`), Tailwind v4 con tokens de `src/index.css`, `@base-ui/react` 1.7 (Menu), Drawer de `src/components/ui/drawer.tsx`, `lucide-react` y `node:test` vía `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-admin-shell-redesign-design.md`

## Global Constraints

- Sin dependencias nuevas. Sin cambios en endpoints, reglas de Firestore, datos ni `src/services/adminFilters.ts` (su test debe seguir verde sin modificarse).
- Contrato de URL intacto: `tab`, `vista`, `ing`, `q`, `cliente`, `estado`. Default: Por compañía (`tab=orders`, `vista=company`). Navegación interna con `replace: true`.
- Copy en español. Títulos de grupo en tipo normal ("Órdenes", "Ajustes"), nunca en MAYÚSCULAS. Íconos Lucide.
- Solo tokens de `src/index.css`: sin hex ni RGBA sueltos en los componentes nuevos o tocados. Texto de 12 px o más (`text-xs` o mayor). Objetivos táctiles de 44 px o más (`min-h-11`).
- Nada importante solo en hover. Respeta `prefers-reduced-motion` (no hace falta animación nueva).
- Una sola acción primaria visible por contexto: "Pedir factura o remisión" en la barra de selección.
- Commits: **solo con autorización explícita de Emiliano**. Los pasos "Commit" se proponen, no se ejecutan solos.

## Review Focus

1. **Entrar a una sección desde `/stats`.** "Por compañía" debe llevar a `/admin` sin parámetros, para que se restauren los filtros guardados como hoy. Las demás secciones abren con filtros por defecto. → `adminSectionHref` (Task 1).
2. **Links legados** (`tab=pending`, `tab=agenda`, `tab=report`). Deben marcar la sección correcta en el sidebar y en la barra inferior. → test en Task 1.
3. **Búsqueda con solo espacios.** No cuenta como filtro activo, no genera chip y no muestra "Limpiar". → test en Task 1.
4. **Ingeniero en el link que ya no está en el equipo.** El chip muestra "Ingeniero: desconocido" y se puede quitar; no desaparece en silencio. → test en Task 1.
5. **Cambiar de sección con órdenes seleccionadas.** La selección se limpia y la barra de selección desaparece; nunca se piden facturas de órdenes ocultas. → Task 4 y verificación en el navegador (Task 5).

---

### Task 1: Módulo puro de secciones

**Files:**
- Create: `src/services/adminSections.ts`
- Test: `src/services/adminSections.test.ts`

**Interfaces:**
- Consumes: `AdminFilters`, `DEFAULT_ADMIN_FILTERS`, `serializeAdminFilters`, `UNASSIGNED_ENGINEER` de `src/services/adminFilters.ts`; `OrderStatusFilter` de `src/components/admin/orderStatusMeta.ts`.
- Produces:
  ```ts
  export type AdminSectionId = 'company' | 'pending' | 'agenda' | 'deliveries' | 'requests' | 'config';
  export interface AdminSection {
    id: AdminSectionId;
    label: string;          // sidebar y título de página
    shortLabel: string;     // barra inferior móvil
    group: 'orders' | 'settings';
    hasToolbar: boolean;    // company, pending, agenda, deliveries
  }
  export const ADMIN_SECTIONS: readonly AdminSection[];   // en este orden: company, pending, agenda, deliveries, requests, config
  export const MOBILE_PRIMARY_SECTIONS: readonly AdminSectionId[]; // ['company','pending','agenda','deliveries']
  export function getSection(id: AdminSectionId): AdminSection;
  export function sectionFromFilters(f: AdminFilters): AdminSectionId;
  export function filtersForSection(id: AdminSectionId, f: AdminFilters): AdminFilters;
  export function adminSectionHref(id: AdminSectionId, current: AdminFilters | null): string; // null = fuera de /admin
  export function isInMoreMenu(id: AdminSectionId): boolean;
  export function hasActiveFilters(f: AdminFilters): boolean;
  export type FilterChipKey = 'search' | 'client' | 'engineer' | 'status';
  export interface FilterChip { key: FilterChipKey; label: string }
  export function activeFilterChips(
    f: AdminFilters,
    resolve: { engineerName: (id: string) => string | null; statusLabel: (s: OrderStatusFilter) => string },
  ): FilterChip[];
  export function clearFilter(f: AdminFilters, key: FilterChipKey): AdminFilters;
  ```

Valores que fija el spec:
- Etiquetas (`label` / `shortLabel`): Por compañía / Compañía · Pendientes / Pendientes · Agenda / Agenda · Entregas / Entregas · Solicitudes / Solicitudes · Configuración / Configuración.
- `group`: `settings` solo para config.

- [ ] **Step 1: Escribir los tests que fallan** en `src/services/adminSections.test.ts` (estilo `node:test` + `assert/strict`, como `adminFilters.test.ts`):
  - `sección ↔ filtros ida y vuelta`: para cada id de `ADMIN_SECTIONS`, `sectionFromFilters(filtersForSection(id, DEFAULT_ADMIN_FILTERS)) === id`.
  - `filtersForSection conserva q, cliente, estado e ing`: partiendo de `{...DEFAULT_ADMIN_FILTERS, search:'PO2026', client:'BOSCH', status:'overdue', engineer:'u-1'}`, `filtersForSection('deliveries', f)` da `tab:'deliveries'` y los cuatro campos iguales.
  - `filtersForSection a una vista de órdenes fija tab=orders`: `filtersForSection('agenda', {...DEFAULT_ADMIN_FILTERS, tab:'config'})` da `{tab:'orders', view:'agenda'}`.
  - `legados`: `sectionFromFilters(parseAdminFilters(new URLSearchParams('tab=pending')))` → `'pending'`; `tab=agenda` → `'agenda'`; `tab=report` → `'company'`; `tab=basura` → `'company'`.
  - `pestañas que no son de órdenes ignoran la vista`: `{tab:'requests', view:'agenda'}` → `'requests'`.
  - `adminSectionHref`: con `current=null`, `'company'` → `'/admin'` y `'pending'` → `'/admin?vista=pending'`. Con `current` que tiene `search:'x'`, `'deliveries'` → `'/admin?tab=deliveries&q=x'`.
  - `reparto móvil`: `MOBILE_PRIMARY_SECTIONS` deep-equal `['company','pending','agenda','deliveries']`; `isInMoreMenu('requests') && isInMoreMenu('config') && !isInMoreMenu('agenda')`.
  - `hasActiveFilters ignora búsqueda de solo espacios`: `hasActiveFilters({...DEFAULT_ADMIN_FILTERS, search:'   '}) === false`, y `true` con `client:'X'`.
  - `chips`: con `{search:' PO1 ', client:'BOSCH', engineer:UNASSIGNED_ENGINEER, status:'overdue'}` y `statusLabel` que devuelve `'Atrasadas'`, el resultado deep-equal es `[{key:'search',label:'Búsqueda: PO1'},{key:'client',label:'Cliente: BOSCH'},{key:'engineer',label:'Ingeniero: sin asignar'},{key:'status',label:'Estado: Atrasadas'}]`.
  - `chip de ingeniero desconocido`: `engineer:'u-viejo'` con `engineerName` que devuelve `null` → `{key:'engineer', label:'Ingeniero: desconocido'}`.
  - `clearFilter`: `clearFilter(f,'status').status === 'all'`, `clearFilter(f,'engineer').engineer === ''`, y no toca `tab` ni `view`.

- [ ] **Step 2: Correr y ver que falla**
  Run: `npx tsx --test src/services/adminSections.test.ts`
  Expected: FAIL (no se puede resolver `./adminSections`).

- [ ] **Step 3: Implementar `src/services/adminSections.ts`** con las firmas de arriba.
  - Sin imports de React ni de lucide; los íconos los pone `AdminNav`.
  - `adminSectionHref`: con `current === null` y sección `company` devuelve `'/admin'` sin query. En los demás casos, `'/admin'` más `?` + `serializeAdminFilters(filtersForSection(id, current ?? DEFAULT_ADMIN_FILTERS))` si la query no está vacía.
  - La búsqueda del chip va recortada con `trim()`.

- [ ] **Step 4: Correr y ver que pasa**
  Run: `npx tsx --test src/services/adminSections.test.ts src/services/adminFilters.test.ts`
  Expected: PASS en todo; `adminFilters.test.ts` sin cambios.

- [ ] **Step 5: Proponer commit** (requiere autorización): `feat(admin): módulo de secciones del Admin`.

---

### Task 2: Navegación por secciones (sidebar y barra móvil) y encabezado por sección

**Files:**
- Create: `src/components/admin/AdminNav.tsx`
- Modify: `src/components/Layout.tsx` (ítem `/admin` en las líneas 77 y 136; barra móvil en las líneas 130-167)
- Modify: `src/pages/AdminPanel.tsx` (cabecera en las líneas 245-259; `Tabs` en las líneas 277-283 y 396-429)

**Interfaces:**
- Consumes: todo lo de Task 1; `useInvoiceRequests` (`src/hooks/useInvoiceRequests.ts`); `Drawer`, `DrawerContent`, `DrawerHeader`, `DrawerTitle` de `src/components/ui/drawer.tsx`.
- Produces:
  ```ts
  export function AdminSidebarSections(): JSX.Element;  // va en el <nav> del sidebar en lugar del ítem '/admin'
  export function AdminMobileNav(): JSX.Element;        // reemplaza la barra inferior solo cuando pathname === '/admin'
  export function useAdminSection(): { onAdmin: boolean; filters: AdminFilters | null; section: AdminSectionId | null };
  ```

- [ ] **Step 1: Escribir `AdminNav.tsx`.**
  - **`useAdminSection`:** usa `useLocation` y `useSearchParams`. Fuera de `/admin`, `filters` y `section` son `null`.
  - **Íconos por sección:** `Building2` para company, `ListTodo` para pending, `CalendarDays` para agenda, `Truck` para deliveries, `FileText` para requests y `Settings` para config.
  - **Contador de Solicitudes:** `useInvoiceRequests({ enabled: onAdmin })`, contando `requests.filter(r => r.status === 'pendiente').length`. Se muestra como `Badge` solo si es mayor que 0.
  - **Links:** `<Link to={adminSectionHref(id, filters)} replace={onAdmin}>`.
  - **`AdminSidebarSections`:** encabezados "Órdenes" y "Ajustes" en `text-xs font-medium text-muted-foreground`, en tipo normal. Cada ítem tiene el mismo estilo que el `navItem` actual de `Layout` (activo: `bg-primary/12`, barra primaria y `text-primary`), y el activo es `section === id`.
  - **`AdminMobileNav`:** `fixed bottom-0 inset-x-0 z-30 flex md:hidden bg-card border-t border-border pb-[env(safe-area-inset-bottom)]`. Lleva los 4 `MOBILE_PRIMARY_SECTIONS` con `shortLabel` y un botón "Más" (`MoreHorizontal`), activo si `isInMoreMenu(section)`. Cada destino mide `min-h-[58px]`, con texto `text-xs`.
  - **Drawer "Más":** contiene Solicitudes (con contador), Configuración, Estadísticas (`/stats`) y TV en vivo (`/`), cada uno de `min-h-11`. Al tocar un destino se cierra el drawer.

- [ ] **Step 2: Integrar en `Layout.tsx`.**
  - Reemplazar `navItem('/admin', …)` por `<AdminSidebarSections />`.
  - Cuando `pathname === '/admin'`, renderizar `<AdminMobileNav />` en lugar de la barra móvil actual.
  - En `/stats` la barra actual se queda tal cual.

- [ ] **Step 3: Quitar `Tabs` en `AdminPanel.tsx`.**
  - Sustituir `<Tabs>…<TabsContent>` por un render condicional según `sectionFromFilters(filters)`. El contenido de cada sección es el mismo que hoy.
  - En la cabecera:
    - `h1` = `getSection(section).label`;
    - subtítulo = "actualizado HH:mm", sin "Solo lectura, desde Odoo";
    - el botón Actualizar se queda.
  - Se eliminan `TAB_CLASS`, `VIEW_LABEL` y los imports que quedan sin uso.
  - Por ahora se conservan las filas de controles; Task 3 las reemplaza.

- [ ] **Step 4: Gates.**
  Run: `npm run lint && npm test`
  Expected: sin errores de TypeScript; todos los tests en PASS.

- [ ] **Step 5: Revisión rápida en el navegador.**
  - Con `preview_start` (config de `.claude/launch.json` para `npm run dev:full`), abrir `/admin?tab=deliveries`: el sidebar marca Entregas y el `h1` dice "Entregas".
  - A 375 px, la barra inferior muestra 5 destinos y "Más" abre el drawer.

- [ ] **Step 6: Proponer commit** (requiere autorización): `feat(admin): secciones en sidebar y barra móvil`.

---

### Task 3: Barra de controles de una fila

**Files:**
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/admin/AdminToolbar.tsx`
- Modify: `src/components/admin/OrdersFilterBar.tsx`. Hoy su único consumidor es `AdminPanel`. Se divide en piezas exportadas y se elimina el export default de la barra.
- Modify: `src/pages/AdminPanel.tsx` (líneas 285-394)

**Interfaces:**
- Consumes: `activeFilterChips`, `clearFilter`, `hasActiveFilters` y `getSection(...).hasToolbar` (Task 1); `useMobile` (`src/hooks/useMobile.ts`); `Drawer*`; `Select*`; `Button`.
- Produces:
  ```ts
  // ui/dropdown-menu.tsx — patrón shadcn sobre @base-ui/react/menu
  export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
  // OrdersFilterBar.tsx
  export const STATUS_OPTIONS: ReadonlyArray<{ value: OrderStatusFilter; label: string }>;
  export function OrderSearchInput(p: { value: string; onChange: (v: string) => void }): JSX.Element;
  export function ClientSelect(p: { value: string; onChange: (v: string) => void; clients: string[]; className?: string }): JSX.Element;
  export function StatusSelect(p: { value: OrderStatusFilter; onChange: (v: OrderStatusFilter) => void; className?: string }): JSX.Element;
  // AdminToolbar.tsx
  export interface ToolbarEngineer { id: string; name: string; count: number }
  export interface AdminToolbarProps {
    filters: AdminFilters;
    onChange: (patch: Partial<AdminFilters>) => void;
    clients: string[];
    engineers: ToolbarEngineer[];
    totalCount: number;        // órdenes sin filtrar (la opción "Todas")
    unassignedCount: number;
    shownCount: number;        // órdenes filtradas
    showGroupToggle: boolean;  // solo en la sección company
    groupByClient: boolean;
    onToggleGroup: () => void;
    onExport: () => void;
    exportLabel: string;       // "Excel" o "Excel (n seleccionadas)"
    exportDisabled: boolean;
  }
  export default function AdminToolbar(props: AdminToolbarProps): JSX.Element;
  ```

- [ ] **Step 1: Crear `ui/dropdown-menu.tsx`.**
  - Envuelve `Menu.Root`, `Menu.Trigger`, `Menu.Portal`, `Menu.Positioner`, `Menu.Popup` y `Menu.Item` de `@base-ui/react/menu`.
  - Copia las clases del popup y de los ítems de `ui/select.tsx` (`bg-popover`, `border-border`, `shadow-overlay`) para que se vean iguales.
  - Ítems de `min-h-11` con `focus-visible`.

- [ ] **Step 2: Dividir `OrdersFilterBar.tsx`** en `OrderSearchInput`, `ClientSelect` y `StatusSelect`, y exportar `STATUS_OPTIONS`.
  - Se conservan `id="order-search"`, `aria-label` y placeholders.
  - El texto de ayuda "Busca en SO, PO del cliente…" pasa a `sr-only`, sigue referenciado por `aria-describedby`.

- [ ] **Step 3: Escribir `AdminToolbar.tsx`.**
  - **Escritorio, una fila con `flex items-center gap-2`:** `OrderSearchInput` (`flex-1`), `ClientSelect`, `StatusSelect`, select **Ingeniero**, botón Excel y `DropdownMenu` "Más".
  - **Select Ingeniero:** valores `''` → "Todas (totalCount)", cada `id` → "name (count)" y `UNASSIGNED_ENGINEER` → "Sin asignar (unassignedCount)". `aria-label` "Filtrar por diseñador o ingeniero".
  - **Menú "Más" (`MoreHorizontal`):** "Copiar link" (mismo `navigator.clipboard` y estado `linkCopied` que hoy, que se mueve aquí); "Lista plana" o "Agrupar por compañía", solo si `showGroupToggle`; e "Imprimir / PDF" (`window.print()`, deshabilitado si `shownCount === 0`).
  - **Línea de estado:** "{shownCount} de {totalCount} órdenes" con `font-mono-data tabular-nums`. Después, un botón chip por cada `activeFilterChips(...)`, con `aria-label="Quitar filtro {label}"` e ícono `X`, que llama `onChange(clearFilter(filters, key))`. "Limpiar" aparece solo si `hasActiveFilters(filters)`.
  - **Móvil (`useMobile()`):** `OrderSearchInput` a todo el ancho y botón "Filtros (n)", con n = chips sin contar el de búsqueda. Abre un `Drawer` con Cliente, Estado, Ingeniero, Excel y las acciones de "Más", todos a ancho completo. La línea de estado se queda debajo.

- [ ] **Step 4: Usar `AdminToolbar` en `AdminPanel.tsx`.**
  - Reemplaza las filas de chips de ingeniero, chips de vista, `OrdersFilterBar`, el conteo y las acciones (líneas 288-392). Se monta solo si `getSection(section).hasToolbar`.
  - La fila de selección (líneas 345-357) se queda por ahora; Task 4 la reemplaza.
  - El estado `linkCopied` y `copyLink` salen de `AdminPanel`.

- [ ] **Step 5: Gates.**
  Run: `npm run lint && npm test`
  Expected: PASS.

- [ ] **Step 6: Proponer commit** (requiere autorización): `feat(admin): barra de controles de una fila`.

---

### Task 4: Barra fija de selección, vacío por filtro e impresión

**Files:**
- Create: `src/components/admin/SelectionBar.tsx`
- Modify: `src/pages/AdminPanel.tsx`
- Modify: `src/index.css` (bloque de impresión en las líneas 142-219)

**Interfaces:**
- Consumes: `hasActiveFilters`, `sectionFromFilters` (Task 1).
- Produces:
  ```ts
  export interface SelectionBarProps {
    count: number;
    onRequest: () => void;
    onClaim: () => void;
    claimDisabled: boolean;
    onExport: () => void;
    onClear: () => void;
  }
  export default function SelectionBar(p: SelectionBarProps): JSX.Element | null; // null si count === 0
  ```

- [ ] **Step 1: Escribir `SelectionBar.tsx`.**
  - **Posición:** `fixed inset-x-0 z-40 bg-card border-t border-border shadow-overlay`. En escritorio, `bottom-0 md:left-64`, para no tapar el sidebar. En móvil, `bottom-[calc(58px+env(safe-area-inset-bottom))]`, encima de `AdminMobileNav`.
  - **Contenido:**
    - texto "{n} orden seleccionada" o "{n} órdenes seleccionadas";
    - "Pedir factura o remisión" (variant `default`, ícono `FileText`);
    - "Asignármelas", "Excel" y "Quitar selección" (variant `secondary` o `ghost`);
    - todo de `min-h-11`.
  - Lleva `role="region"` y `aria-label="Órdenes seleccionadas"`.

- [ ] **Step 2: Conectarlo en `AdminPanel.tsx`.**
  - Reemplaza la fila de selección (líneas 345-357) por `<SelectionBar count={selectedCount} … onClear={() => setRowSelection({})} />`.
  - Añade al contenedor `pb-24` cuando `selectedCount > 0`, para que la barra no tape la última fila.
  - Limpia la selección al cambiar de sección: `useEffect(() => setRowSelection({}), [section])`.

- [ ] **Step 3: Vacío por filtro.**
  - Condición: la sección tiene `hasToolbar`, `!isLoading`, `orders.length > 0`, `filteredOrders.length === 0` y `hasActiveFilters(filters)`.
  - En ese caso se muestra, en lugar del contenido, el texto "Ninguna orden coincide con estos filtros" y un botón "Limpiar filtros" que llama `updateFilters({ search:'', client:'', engineer:'', status:'all' })`.
  - En cualquier otro caso se muestra el contenido actual.

- [ ] **Step 4: Impresión.**
  - Envolver `AdminToolbar` y `SelectionBar` con `order-report-no-print`, o bien añadir `print:hidden`.
  - Comprobar que el bloque de impresión de `src/index.css` ya oculta `aside` y `nav`. `AdminMobileNav` es un `nav`, así que queda cubierto. Solo se agrega regla si la vista previa muestra alguna barra.

- [ ] **Step 5: Gates.**
  Run: `npm run lint && npm test`
  Expected: PASS.

- [ ] **Step 6: Proponer commit** (requiere autorización): `feat(admin): barra fija de selección y vacío por filtro`.

---

### Task 5: Verificación de punta a punta y documentación

**Files:**
- Modify: `CLAUDE.md`, sección "Admin: Agenda y estado en el link": una línea que diga que las pestañas ahora son secciones del sidebar y de la barra móvil (`src/services/adminSections.ts`), con el mismo contrato de URL.
- Modify: `DESIGN.md`, Decisions Log: una entrada del 2026-11-11 con el shell del Admin por secciones y la barra de una fila.

- [ ] **Step 1: Gates finales.**
  Run: `npm run lint && npm test && npm run build`
  Expected: los tres terminan sin error.

- [ ] **Step 2: Navegador a 1440×900.**
  - Recorrer las 6 secciones desde el sidebar.
  - Abrir `/admin?tab=report` y `/admin?tab=pending`, y confirmar la sección marcada.
  - Desde `/stats`, entrar a "Por compañía" y confirmar que se restauran los filtros guardados.
  - Filtrar por cliente, estado e ingeniero, quitar cada chip y usar "Limpiar".
  - Copiar link y reabrirlo en una pestaña nueva.
  - Seleccionar 2 órdenes, cambiar a Agenda y volver: la selección está vacía.
  - Seleccionar otra vez y abrir "Pedir factura o remisión", cerrando sin enviar.
  - Vista previa de impresión con `window.print`, desde el diálogo del navegador.
  - Revisar la consola sin errores.

- [ ] **Step 3: Navegador a 375×812.**
  - Comprobar que no hay scroll horizontal (`document.documentElement.scrollWidth <= innerWidth`).
  - Los 5 destinos de la barra inferior; "Más" con Solicitudes y Configuración marcando "Más" como activo.
  - El drawer "Filtros (n)".
  - La barra de selección encima de la barra inferior.

- [ ] **Step 4: Capturas y checklist.**
  - Capturas de escritorio y móvil.
  - Repasar el checklist anti-slop y los "Errores que ya cometimos" de `wiki/concepts/UI-UX-anti-slop-movil.md`: sin MAYÚSCULAS, sin RGBA sueltos, nada solo en hover, fila de chips sin cortes.
  - Reportar qué se corrigió y qué queda pendiente.

- [ ] **Step 5: Proponer commit** (requiere autorización): `docs(admin): shell por secciones`.
