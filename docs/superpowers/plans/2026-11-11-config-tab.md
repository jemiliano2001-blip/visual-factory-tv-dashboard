# Configuración: horarios y acceso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la pestaña Configuración del Admin: horarios por cliente con origen visible (Odoo vs manual), validaciones y estados claros, y una lista de solo lectura de quién tiene acceso y quién puede editar horarios.

**Architecture:** Dos funciones puras con TDD (`src/services/configView.ts`, `shared/teamAccess.ts`) alimentan la UI y un endpoint nuevo `GET /api/team-access`. `ConfigTab` se parte en `ScheduleList` y `TeamAccess`. El permiso de edición se lee del claim `admin` del token (UI) y se verifica en servidor con `admin.auth().getUser` (endpoint). Las reglas de Firestore no cambian.

**Tech Stack:** React 19 + TS strict, Tailwind v4 (tokens en `src/index.css`), shadcn-style en `src/components/ui/`, React Query, Express (`server.ts`) y Firebase Functions (`functions/src/index.ts`), `node:test` vía `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-11-11-config-tab-design.md`

## Global Constraints

- UI toda en español; tono de errores claro y sin culpar a la sesión.
- Odoo manda sobre el manual: la prioridad real sigue siendo `getEffectiveDeliverySchedule` (`src/services/odoo.ts`); NO se cambia.
- Límites de reglas Firestore: `company_name` 1–100, `delivery_schedule` 1–500; no se modifican reglas.
- Duplicados por `normalizeCompanyName` / `hasDuplicateCompanyConfig` (`src/services/companyConfigGuards.ts`).
- Objetivos táctiles ≥44 px (`min-h-11`), nada solo en hover, tokens (sin rgba sueltos), texto ≥12 px. Leer `DESIGN.md` antes de decisiones visuales.
- Móvil (`useMobile()`, <768 px): editar en `Drawer`; en Drawer usar `<select>` nativo (los popups de Base UI quedan bajo el Drawer).
- `/api/team-access` exige claim `admin` verificado en servidor; no expone correos ni uids más allá de lo necesario.
- No commit/push/deploy sin autorización de Emiliano; los pasos "Commit" solo se ejecutan si él ya autorizó commits en esta sesión (si no, pedir).
- Gates: `npm run lint`, `npm test`, `npm run build`.

## Review Focus

1. Cliente en Firestore con nombre distinto solo por mayúsculas/espacios al de Odoo ("Bosch " vs "BOSCH") — debe unirse a una sola fila (Task 1).
2. Orden con `delivery_times` de solo espacios o `null` — no cuenta como horario de Odoo (Task 1).
3. Hub sin documento para un admin de Auth, y documento de Hub sin usuario en Auth (inactivo) — ambos aparecen sin romper (Task 2).
4. Primer snapshot aún no llega: debe verse "Cargando…", no vacío (Task 4).
5. Cuenta sin claim `admin`: controles desactivados y sección de acceso oculta, no error 403 visible (Tasks 4–5).

---

### Task 1: `buildScheduleRows` (vista combinada de horarios)

**Files:**
- Create: `src/services/configView.ts`
- Test: `src/services/configView.test.ts`

**Interfaces:**
- Consumes: `normalizeCompanyName(name: string): string` de `./companyConfigGuards`; `CompanyConfig` de `../types`; `OdooSaleOrder` (campos `partner_name`, `delivery_times?: string | null`) de `./odoo`.
- Produces:
  ```ts
  export type ScheduleSource = 'odoo' | 'manual' | 'none';
  export interface ScheduleRow {
    key: string;            // normalizeCompanyName(name)
    name: string;           // nombre a mostrar (preferir el de Odoo, luego el de Firestore)
    odoo: string | null;    // delivery_times recortado, null si vacío
    manual: string | null;  // delivery_schedule recortado, null si vacío/sin config
    configId: string | null;
    updatedAt: Date | null; // null si no hay config o es Date(0)
    source: ScheduleSource; // odoo si hay odoo; si no manual si hay manual; si no none
    orphan: boolean;        // hay config manual pero ningún cliente con órdenes abiertas
  }
  export function buildScheduleRows(
    orders: ReadonlyArray<Pick<OdooSaleOrder, 'partner_name' | 'delivery_times'>>,
    configs: readonly CompanyConfig[],
  ): ScheduleRow[];
  export function filterScheduleRows(rows: readonly ScheduleRow[], term: string): ScheduleRow[];
  ```

- [ ] **Step 1: Write failing tests** in `configView.test.ts` (`node:test` + `assert/strict`, mismo estilo que `companyConfigGuards.test.ts`):
  - `Odoo manda: fila con delivery_times y config manual → source 'odoo', manual conservado`.
  - `solo manual → source 'manual', orphan false si el cliente tiene órdenes`.
  - `config sin órdenes → orphan true, aparece en la lista`.
  - `cliente con órdenes y sin horario → source 'none'`.
  - `"Bosch " (config) y "BOSCH" (orden) → una sola fila, name 'BOSCH'`.
  - `delivery_times '   ' o null → odoo null`.
  - `updatedAt Date(0) → null`.
  - `orden por name con es-MX localeCompare`.
  - `filterScheduleRows ignora acentos/mayúsculas ("pérez" encuentra "PEREZ SA") y term vacío devuelve todo`.
- [ ] **Step 2: Run** `npx tsx --test src/services/configView.test.ts` → Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement** `buildScheduleRows` y `filterScheduleRows` en `src/services/configView.ts`: agrupar por `normalizeCompanyName`; el primer `delivery_times` no vacío de cualquier orden del cliente es `odoo`. `filterScheduleRows` normaliza con `NFD` sin diacríticos + `toLocaleLowerCase('es-MX')`.
- [ ] **Step 4: Run** the same command → Expected: PASS (todas).
- [ ] **Step 5: Commit** `git add src/services/configView.ts src/services/configView.test.ts && git commit -m "feat(config): vista combinada de horarios Odoo/manual"`

### Task 2: `buildTeamAccess` y `isAdminClaim` (lógica pura compartida)

**Files:**
- Create: `shared/teamAccess.ts`
- Test: `shared/teamAccess.test.ts`

**Interfaces:**
- Consumes: `evaluarAccesoHub(doc: unknown, email: string | null): HubAccess` de `./hubAccess`.
- Produces:
  ```ts
  export interface TeamMember { name: string; active: boolean; canEditSchedules: boolean }
  export interface TeamAccessResponse { available: boolean; members: TeamMember[] }
  export interface HubUserDoc { uid: string; data: unknown }
  export interface AuthUserInfo { uid: string; email: string | null; displayName: string | null; customClaims?: Record<string, unknown> | null }
  export function isAdminClaim(claims: Record<string, unknown> | null | undefined): boolean; // claims?.admin === true
  export function buildTeamAccess(hubDocs: readonly HubUserDoc[], authUsers: readonly AuthUserInfo[]): TeamMember[];
  ```

- [ ] **Step 1: Write failing tests** en `teamAccess.test.ts`:
  - `usuario del Hub activo sin claim → active true, canEditSchedules false`.
  - `usuario del Hub con activo false → active false`.
  - `admin de Auth sin documento en Hub → aparece, active false, canEditSchedules true (salvo el correo break-glass: active true)`.
  - `documento del Hub sin usuario de Auth → aparece con nombre del Hub (operadorNombre)`.
  - `nombre: operadorNombre → displayName → 'Sin nombre'` (nunca el correo).
  - `isAdminClaim: {admin:true} true; {admin:'true'}, {}, null, undefined → false`.
  - `orden: activos primero, luego nombre con es-MX; la salida no contiene uid ni email`.
  - `lista vacía → []`.
- [ ] **Step 2: Run** `npx tsx --test shared/teamAccess.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement** en `shared/teamAccess.ts` (sin imports de Node/Firebase; solo `./hubAccess`). Unir por uid; `active = evaluarAccesoHub(data, email).allowed`.
- [ ] **Step 4: Run** the same → Expected: PASS.
- [ ] **Step 5: Commit** `git add shared/teamAccess.ts shared/teamAccess.test.ts && git commit -m "feat(config): lógica pura de acceso del equipo"`

### Task 3: Endpoint `GET /api/team-access`

**Files:**
- Modify: `functions/src/index.ts` (tras las rutas `/api/order-assignments`, antes de las de invoice-requests o junto a ellas)
- Modify: `server.ts` (junto a las demás rutas `/api/*`)
- Create: `src/services/teamAccess.ts` (cliente) y `src/hooks/useTeamAccess.ts`
- Test: `src/services/teamAccess.test.ts`

**Interfaces:**
- Consumes: `buildTeamAccess`, `isAdminClaim`, `TeamAccessResponse` (Task 2); `getIdTokenOrThrow()` de `../firebase`; patrón de `request()` en `src/services/invoiceRequests.ts` (PROXY_BASE, `Authorization: Bearer`, errores en español).
- Produces:
  - `fetchTeamAccess(): Promise<TeamAccessResponse>` y `useTeamAccess(options?: { enabled?: boolean })` con key `['teamAccess']`, `retry: 1`, `staleTime: 60_000`.
  - Endpoint: 200 `TeamAccessResponse`; 403 `{error}` si quien llama no tiene claim `admin`; 503 `{error}` si falla Hub/Auth.

- [ ] **Step 1: Write failing test** `teamAccess.test.ts` del cliente: con `globalThis.fetch` simulado, `fetchTeamAccess` devuelve el JSON; con respuesta 403 lanza `Error` con el mensaje del servidor; con `fetch` que rechaza lanza "No se pudo conectar con el servidor." (si `getIdTokenOrThrow` no es mockeable en node, extraer `parseTeamAccessResponse(response: Response): Promise<TeamAccessResponse>` y probar esa función).
- [ ] **Step 2: Run** `npx tsx --test src/services/teamAccess.test.ts` → Expected: FAIL.
- [ ] **Step 3: Implement** el cliente y el hook; luego en `functions/src/index.ts`: ruta que (a) `admin.auth().getUser(actor.uid)` y exige `isAdminClaim(user.customClaims)`, si no 403 "Solo quien puede editar horarios ve esta lista."; (b) lee `hubDb().collection('usuarios').get()` y `admin.auth().listUsers(1000)`; (c) responde `{ available: true, members: buildTeamAccess(...) }`; errores → 503 con log. En `server.ts` responder `{ available: false, members: [] }`.
- [ ] **Step 4: Run** `npx tsx --test src/services/teamAccess.test.ts && npm run lint` → Expected: PASS, tsc sin errores (incluye `functions/` si su tsconfig lo cubre; si no, `cd functions && npx tsc --noEmit`).
- [ ] **Step 5: Commit** `git add functions/src/index.ts server.ts src/services/teamAccess.ts src/services/teamAccess.test.ts src/hooks/useTeamAccess.ts && git commit -m "feat(config): endpoint de acceso del equipo (solo lectura)"`

### Task 4: `ScheduleList` + `ConfigTab` contenedor

**Files:**
- Create: `src/components/admin/ScheduleList.tsx`, `src/hooks/useCanEditSchedules.ts`
- Modify: `src/components/admin/ConfigTab.tsx` (pasa a contenedor), `src/pages/AdminPanel.tsx:314` (pasar `orders` en lugar de `companyNames`)
- Test: `src/services/configView.test.ts` (ampliar con validación) 

**Interfaces:**
- Consumes: `buildScheduleRows`, `filterScheduleRows`, `ScheduleRow` (Task 1); `subscribeToCompanyConfigs`, `createCompanyConfig`, `updateCompanyConfig`, `deleteCompanyConfig` (`src/services/companyConfigs.ts`, sin cambios); `hasDuplicateCompanyConfig`; `useMobile`; `Dialog`, `Drawer`, `Button`, `Input`, `Card`, `Badge`.
- Produces:
  - `validateScheduleInput(name: string, schedule: string): { ok: true } | { ok: false; error: string }` exportada desde `configView.ts`: nombre vacío/solo espacios → "Escribe el nombre del cliente."; >100 → "El nombre admite hasta 100 caracteres."; horario vacío/solo espacios → "Escribe el horario de entrega."; >500 → "El horario admite hasta 500 caracteres."
  - `useCanEditSchedules(): { loading: boolean; canEdit: boolean }` — lee `auth.currentUser.getIdTokenResult()` y `isAdminClaim(claims)`; `loading` true hasta resolver; `canEdit` false si falla.
  - `ConfigTab({ orders }: { orders: OdooSaleOrder[] })`.

- [ ] **Step 1: Write failing tests** de `validateScheduleInput` (los 4 mensajes, límites 100/500 exactos pasan, 101/501 fallan, valores con espacios laterales se recortan antes de medir).
- [ ] **Step 2: Run** `npx tsx --test src/services/configView.test.ts` → Expected: FAIL en `validateScheduleInput`.
- [ ] **Step 3: Implement** `validateScheduleInput` en `configView.ts`.
- [ ] **Step 4: Run** the same → Expected: PASS.
- [ ] **Step 5: Implement `ScheduleList.tsx`** reemplazando la rejilla actual: estado `configs: CompanyConfig[] | null` (`null` = "Cargando…", no vacío); buscador; por fila: nombre, etiqueta de origen ("Odoo manda" / "Manual" / "Sin horario"), horario de Odoo y manual (manual rotulado "respaldo, hoy no se usa" si `odoo` existe), "Editado el <fecha es-MX>" y "huérfano" ("Sin órdenes abiertas") ; botones editar/eliminar `min-h-11 min-w-11` siempre visibles (quitar `opacity-70 group-hover`); alta con campo de nombre libre + sugerencias de los clientes de la lista (`<datalist>` o `Select` + "Otro…"; elegir lo más simple); edición en `Dialog` en escritorio y `Drawer` en móvil; aviso de éxito con `role="status"` tras guardar/borrar (se oculta a los 4 s); errores con `role="alert"` dentro del diálogo; usar `validateScheduleInput` y `hasDuplicateCompanyConfig`. Sin `canEdit`: botones desactivados y banner "Tu cuenta no puede editar horarios; pide el permiso de editor".
- [ ] **Step 6: Implement** `useCanEditSchedules`, convertir `ConfigTab` en contenedor (`<ScheduleList orders={orders} canEdit=… />` y, tras Task 5, `<TeamAccess />`), y en `AdminPanel.tsx:314` pasar `orders={orders}`; quitar `uniqueClients` de esa línea sin tocar su uso en la barra de filtros.
- [ ] **Step 7: Run** `npm run lint && npm test` → Expected: PASS.
- [ ] **Step 8: Verify in browser** (`npm run dev:full`, 1440 px y 375 px; el login lo hace Emiliano): "Cargando…" antes del primer snapshot, búsqueda, etiquetas de origen, editar/crear/borrar con aviso de éxito, nombre duplicado ("Bosch " vs "bosch") rechazado, cuenta sin claim con controles desactivados.
- [ ] **Step 9: Commit** `git add src/components/admin src/hooks/useCanEditSchedules.ts src/services/configView.ts src/services/configView.test.ts src/pages/AdminPanel.tsx && git commit -m "feat(config): lista de horarios con origen, validaciones y estados"`

### Task 5: `TeamAccess` (solo lectura) y cierre

**Files:**
- Create: `src/components/admin/TeamAccess.tsx`
- Modify: `src/components/admin/ConfigTab.tsx` (montar la sección solo si `canEdit`), `CLAUDE.md` (párrafo en la sección de Configuración/Auth), `DESIGN.md` (fila en Decisions Log 2026-11-11 si se tomó alguna decisión visual nueva)

**Interfaces:**
- Consumes: `useTeamAccess` (Task 3); `useCanEditSchedules` (Task 4); `TeamMember` (Task 2).
- Produces: `TeamAccess()` sin props.

- [ ] **Step 1: Implement `TeamAccess.tsx`**: `useTeamAccess({ enabled: canEdit })`; estados: cargando, error (mensaje del servidor, resto de Configuración intacto), `available:false` → "No disponible en el servidor local", lista vacía → "Nadie encontrado"; por persona nombre, "Acceso: sí/no" y "Puede editar horarios: sí/no" con texto además de color; texto fijo "El acceso se administra en SMV Hub. Aquí solo se consulta." Tarjetas apiladas en móvil.
- [ ] **Step 2: Wire** en `ConfigTab`: renderizar `TeamAccess` solo si `canEdit` (sin claim no se muestra ni se consulta).
- [ ] **Step 3: Run** `npm run lint && npm test && npm run build` → Expected: todo verde (anotar cantidad de tests).
- [ ] **Step 4: Verify in browser** (1440 y 375 px): sección con claim (si la cuenta de prueba lo tiene), oculta sin claim, "no disponible" en local, error simulado (apagar el servidor) no rompe los horarios.
- [ ] **Step 5: Docs**: añadir a `CLAUDE.md` un párrafo sobre Configuración (Odoo manda / manual respaldo, `/api/team-access` con claim `admin`, `configView.ts`, `teamAccess.ts`).
- [ ] **Step 6: Final review**: revisión de todo el diff de la rama por un `code-reviewer` en modelo fuerte (lo dispara el ejecutor, no este plan); corregir Critical/Important con TDD; Minor al registro.
- [ ] **Step 7: Commit** `git add -A && git commit -m "feat(config): acceso del equipo en solo lectura y docs"` (con autorización).

---

## Self-review (hecha)
- **Cobertura del spec:** horarios (T1, T4), estados/validaciones (T4), acceso (T2, T3, T5), piezas puras (T1, T2), endpoint local/Functions (T3), verificación y docs (T4, T5). Sin huecos.
- **Consistencia de tipos:** `ScheduleRow`, `TeamMember`, `TeamAccessResponse`, `useCanEditSchedules` y `ConfigTab({orders})` se usan con los mismos nombres en todas las tareas.
- **Riesgo:** T3 toca Functions de producción; solo se despliega con `npm run deploy` y autorización explícita.
