# Configuración: horarios y acceso (proyecto 2 de 3)

Fecha: 2026-11-11 · Estado: pendiente de revisión · Rama base: `feat/admin-shell-redesign`

## Intención
Que Configuración sea una herramienta confiable para (a) mantener los horarios de entrega por cliente y (b) saber quién tiene acceso al dashboard y quién puede editar horarios. No cambia lo que ve la TV.

## Decisiones (de Emiliano)
- **Prioridad de horarios:** Odoo manda; el horario manual es respaldo. Es el comportamiento actual de `getEffectiveDeliverySchedule` (`src/services/odoo.ts`); solo se hace visible.
- **Clientes listados:** con órdenes abiertas + los que ya tienen horario guardado + alta manual de un nombre nuevo. Sin endpoint nuevo de contactos Odoo.
- **Acceso:** lista de solo lectura. Dar o quitar acceso sigue siendo en SMV Hub. Solo la ve quien puede editar horarios (claim `admin`).

## Diseño

### 1. Horarios
- Buscador (sin acentos/mayúsculas) sobre la lista.
- Por cliente: horario de Odoo (`delivery_times`), horario manual, y una etiqueta de cuál usa la TV ("Odoo manda" / "Manual" / "Sin horario"). Si hay horario de Odoo, el manual se rotula "respaldo, hoy no se usa"; sigue editable.
- "Editado el …" desde `updatedAt`.
- Botón editar de ≥44 px siempre visible (no solo en hover); en móvil la edición abre un Drawer.
- Alta manual: campo de nombre nuevo; se valida con `hasDuplicateCompanyConfig`/`normalizeCompanyName`.
- Los horarios huérfanos (cliente sin órdenes hoy) aparecen y se pueden editar o borrar.

### 2. Estados y validaciones
- "Cargando…" hasta el primer snapshot de Firestore (hoy se ve un falso vacío).
- Horario de solo espacios: mensaje propio, no "sin permiso". Límites de las reglas: nombre 1–100, horario 1–500.
- Aviso de éxito al guardar o borrar; errores en lenguaje claro.
- Sin claim `admin`: controles desactivados con explicación (se lee del token con `getIdTokenResult`); las reglas de Firestore no cambian.

### 3. Acceso (solo lectura)
- `GET /api/team-access`, protegido como el resto de `/api/*` y además exige claim `admin`; si no, 403.
- Cruza `usuarios/{uid}` del Hub (base `compras-americanas`, campos `activo`, `operadorNombre`) con los usuarios de Firebase Auth con claim `admin`.
- La UI lista por persona "Acceso sí/no" y "Puede editar horarios sí/no", con el texto fijo "El acceso se administra en SMV Hub".
- `server.ts` local responde "no disponible en local". Si falla la lectura del Hub: error en esa sección; los horarios siguen funcionando.
- No se exponen correos ni uids en la respuesta más de lo necesario (nombre, estados).

### 4. Piezas
- `src/services/configView.ts` (puro, TDD): combina clientes abiertos, configs de Firestore y horarios de Odoo en filas `{name, odoo, manual, source, updatedAt, orphan}`.
- `shared/teamAccess.ts` (puro + prueba): une usuarios del Hub y de Auth en la lista pública.
- `src/components/admin/ScheduleList.tsx` y `TeamAccess.tsx`; `ConfigTab.tsx` pasa a ser el contenedor. `src/hooks/useTeamAccess.ts`.
- Endpoint en `functions/src/index.ts` y `server.ts`.

## Fuera de alcance
Alertas de Discord (proyecto 3); cambiar quién tiene acceso desde aquí; reglas de Firestore; el contenido de las demás secciones.

## Verificación
- TDD: `configView.test.ts` (Odoo manda, huérfanos, duplicados por normalización, vacío), `teamAccess.test.ts` (cruces, inactivos, sin claim).
- `npm run lint`, `npm test`, `npm run build`.
- Navegador a 1440 px y 375 px: buscar, editar, éxito/error, cuenta sin claim, sección de acceso en local ("no disponible").
