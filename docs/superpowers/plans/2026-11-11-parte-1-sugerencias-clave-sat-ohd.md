# Parte 1 — Sugerencias de clave SAT para OHD: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando la lista de Mary no sugiere clave para una partida de OHD, el diálogo ofrece hasta 3 candidatas del catálogo SAT oficial; el ingeniero elige y el correo marca las claves fuera de la lista como "validar".

**Architecture:** Un catálogo recortado (12,152 claves, ~600 KB) generado desde el catálogo del SMV Hub vive en `shared/satCatalogData.ts`. Un buscador puro (`shared/satSearch.ts`) recibe el catálogo como argumento: el cliente lo carga con `import()` dinámico solo para OHD y el servidor lo importa estáticamente (`shared/satCatalogServer.ts`) para validar. `createInvoiceRequests` recibe la validación por contexto, así `shared/invoiceRequests.ts` nunca importa el catálogo y no engorda el paquete del navegador.

**Tech Stack:** TypeScript estricto, `node:test` vía `tsx --test`, React 19 + Vite, Firebase Functions (commonjs).

**Spec:** `docs/superpowers/specs/2026-11-11-sat-sugerencias-y-factura-parcial-design.md` (sección "Parte 1"). Esta es la primera de dos entregas; la Parte 2 tiene su propio plan y es independiente.

## Global Constraints

- Sin IA: no reintroducir Gemini ni ninguna llamada a modelos (CLAUDE.md del repo).
- La clave SAT es solo para OHD (`isOhdPartner`); los demás clientes no llevan `satKeys`.
- Catálogo: divisiones `23, 24, 26, 27, 30, 31, 32, 39, 40, 41, 43, 56, 72, 73, 81` del catálogo `phpcfdi-10.16.20260903` (12,152 claves).
- Candidatas: máximo 3, nunca preseleccionadas; "sin coincidencia" devuelve `[]`.
- Texto del correo para claves fuera de lista: ` (fuera de la lista de OHD, validar)` justo después de `Clave SAT <código>`.
- Una clave del body se acepta solo si está en la lista de Mary o en el catálogo recortado; si no, motivo en español en `skipped`.
- `src/` y `shared/invoiceRequests.ts` no importan `shared/satCatalogData.ts` de forma estática.
- Estilo del repo: español en UI y mensajes, sin ESLint (`npm run lint` = `tsc --noEmit`), pruebas con `node:test`; no hacer commit/push/deploy sin que el usuario lo pida.
- Las Functions compilan con `cd functions && npx tsc --noEmit -p .` (incluye `../shared/**/*`).

## Review Focus

1. Descripción vacía o solo medidas/números (`"12 mm"`, `"3/8"`) → `[]`, sin excepción. (Task 3)
2. Clave del body con espacios, minúsculas o 7 dígitos → rechazada con motivo. (Task 4)
3. Solicitud guardada antes de este cambio (sin `inList`) → se lee como `inList: true`, el correo no la marca. (Tasks 4 y 5)
4. El catálogo no carga en el navegador (import dinámico falla) → el selector sigue mostrando la lista de Mary y el envío no se bloquea. (Task 6)
5. Descripción enorme (notas de ~4000 caracteres) → el buscador solo usa las primeras 30 palabras y no se congela. (Task 3)

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `shared/satText.ts` (nuevo) | `normalizeSatText`, normalización compartida entre la lista de Mary y el buscador |
| `shared/satOhd.ts` (modifica) | usa `normalizeSatText` en vez de su `normalize` privado |
| `scripts/build-sat-catalog.mjs` (nuevo) | genera `shared/satCatalogData.ts` desde el catálogo del Hub |
| `shared/satCatalogData.ts` (generado, versionado) | `SAT_CATALOG_VERSION`, `SAT_CATALOG` |
| `shared/satSearch.ts` (nuevo) | `suggestSatCandidates`, `satChoicesFor`, tipos |
| `shared/satCatalogServer.ts` (nuevo) | `isKnownSatCode` para servidor (importa los datos) |
| `shared/invoiceRequests.ts` (modifica) | `SatKey.inList`, validación por contexto |
| `shared/invoiceRequest.ts` (modifica) | marca en el correo |
| `server.ts`, `functions/src/index.ts` (modifican) | pasan `isKnownSatCode` al contexto |
| `src/hooks/useSatCatalog.ts` (nuevo) | carga diferida del catálogo en el navegador |
| `src/components/RequestDialog.tsx` (modifica) | selector con candidatas y aviso |

---

### Task 1: Normalización compartida

**Files:**
- Create: `shared/satText.ts`
- Modify: `shared/satOhd.ts` (reemplazar la función privada `normalize`)
- Test: `shared/satText.test.ts`

**Interfaces:**
- Produces: `normalizeSatText(s: string): string` — mayúsculas, sin acentos, todo lo que no sea `A-Z0-9` se vuelve un espacio, resultado rodeado de un espacio a cada lado (`" PLACA DE ACERO "`). Es exactamente el comportamiento actual de `normalize` en `shared/satOhd.ts`.

- [ ] **Step 1: Write the failing test** `shared/satText.test.ts`: `normalizeSatText('Fab. de Interfaces')` → `' FAB DE INTERFACES '`; `normalizeSatText('Ñandú—ÁÉÍ')` sin acentos (`' NANDU AEI '`); `normalizeSatText('')` → `'  '`... usar `assert.equal(normalizeSatText('   ').trim(), '')`.
- [ ] **Step 2: Run** `npx tsx --test shared/satText.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3: Implement** `normalizeSatText` en `shared/satText.ts` moviendo el cuerpo de `normalize` de `satOhd.ts`; en `satOhd.ts` importar `{ normalizeSatText } from './satText'` y borrar la función local (cambiar sus dos usos).
- [ ] **Step 4: Run** `npx tsx --test shared/satText.test.ts shared/satOhd.test.ts` → todas PASS (las pruebas de `satOhd` prueban que la refactorización no cambió nada).
- [ ] **Step 5: Commit** `refactor(sat): normalización compartida entre lista de OHD y buscador`.

---

### Task 2: Catálogo SAT recortado (script, datos, prueba)

**Files:**
- Create: `scripts/build-sat-catalog.mjs`, `shared/satCatalogData.ts` (generado), `shared/satCatalogData.test.ts`

**Interfaces:**
- Produces (en `shared/satCatalogData.ts`):
  `export const SAT_CATALOG_VERSION: string;`
  `export const SAT_CATALOG: ReadonlyArray<readonly [code: string, name: string]>;`
  Cada tupla es `[clave de 8 dígitos, descripción oficial]`, ordenada por clave. La descripción es el campo `descripcion` del catálogo del Hub tal cual.

- [ ] **Step 1: Write the failing test** `shared/satCatalogData.test.ts` con estas aserciones: todas las claves cumplen `/^\d{8}$/` y no hay repetidas; las divisiones presentes son un subconjunto de `['23','24','26','27','30','31','32','39','40','41','43','56','72','73','81']`; `SAT_CATALOG.length === 12152`; **cada** `code` de `SAT_OHD_CATALOG` (de `shared/satOhd.ts`) existe en `SAT_CATALOG` con el mismo texto salvo diferencias de mayúsculas/acentos (comparar con `normalizeSatText`; excepción conocida: `39121607` y `81101600`, cuyo nombre en la lista de Mary es más corto — comprobar solo existencia); existe `['23152206', 'Protección de barrera']`; `SAT_CATALOG_VERSION` empieza con `phpcfdi-`; el archivo pesa menos de 800 KB (`fs.statSync`).
- [ ] **Step 2: Run** `npx tsx --test shared/satCatalogData.test.ts` → FAIL (archivo no existe).
- [ ] **Step 3: Implement** `scripts/build-sat-catalog.mjs <ruta-catalogo.json>`: lee el JSON del Hub (`{ version, entries: [{clave, descripcion}] }`), filtra por la lista de divisiones (constante al inicio del script), ordena por clave y escribe `shared/satCatalogData.ts` con un encabezado `// GENERADO por scripts/build-sat-catalog.mjs — no editar a mano`, `SAT_CATALOG_VERSION` y el arreglo (una tupla por línea).
- [ ] **Step 4: Run** `node scripts/build-sat-catalog.mjs "D:/proyectos_code/IA Personal/apps/SMV-Hub/data/sat/catalogo.json"` y luego la prueba del Step 2 → PASS. Esperado en consola del script: `12152 claves, versión phpcfdi-10.16.20260903`.
- [ ] **Step 5: Commit** `feat(sat): catálogo SAT recortado para sugerencias` (incluye el archivo generado).

---

### Task 3: Buscador de candidatas

**Files:**
- Create: `shared/satSearch.ts`
- Test: `shared/satSearch.test.ts`

**Interfaces:**
- Consumes: `normalizeSatText` (Task 1); `suggestSatOhdCode` y `isSatOhdCode` de `shared/satOhd.ts`; `SAT_CATALOG` (Task 2) solo en la prueba de integración.
- Produces:
  `export type SatCatalog = ReadonlyArray<readonly [code: string, name: string]>;`
  `export interface SatCandidate { code: string; name: string; score: number }`
  `export function suggestSatCandidates(description: string, catalog: SatCatalog, limit = 3): SatCandidate[]`
  `export interface SatChoices { suggested: string | null; candidates: SatCandidate[] }`
  `export function satChoicesFor(description: string, catalog: SatCatalog | null): SatChoices`

**Algoritmo de `suggestSatCandidates`** (lo que firma y pruebas no determinan):
1. Palabras de la descripción: `normalizeSatText` → separar por espacio → descartar las que tengan dígitos, longitud < 3 o estén en `STOP` (`DE DEL LA LAS LOS EL CON SIN POR PARA UNA UNO UNOS UNAS EN Y O A AL SE QUE INCLUYE PZA PIEZA PIEZAS FAB DIS DISEÑO`; ya sin acentos) → quitar `ES`/`S` final si la palabra tiene más de 4 letras → tomar solo las primeras 30.
2. Palabras genéricas del catálogo (`GENERIC`): `MAQUINA EQUIPO EQUIPOS SERVICIO SERVICIOS HERRAMIENTA HERRAMIENTAS ACCESORIO ACCESORIOS COMPONENTE COMPONENTES SISTEMA SISTEMAS DISPOSITIVO DISPOSITIVOS SUMINISTRO SUMINISTROS`.
3. Por cada entrada del catálogo (con sus palabras calculadas igual, índice en una caché por referencia de arreglo): puntaje = 10 por palabra específica coincidente + 2 por palabra genérica coincidente + 15 por cada par de palabras consecutivas de la consulta que aparece consecutivo en la entrada − 0.5 × (palabras de la entrada que no coincidieron). Si no coincidió **ninguna palabra específica**, la entrada se descarta. Puntaje mínimo para entrar: 10.
4. Orden: puntaje desc, luego nombre más corto, luego clave asc. Devolver `limit` primeras con `score` redondeado a 1 decimal.
`satChoicesFor`: `suggested = suggestSatOhdCode(description)`; si `suggested` existe o `catalog` es `null` → `candidates: []`; si no, `suggestSatCandidates(description, catalog)`.

- [ ] **Step 1: Write the failing tests** `shared/satSearch.test.ts` con un catálogo sintético `FAKE` (6–8 entradas, p. ej. `['27131703','Pistones de cilindro neumático']`, `['27131500','Herramientas neumáticas']`, `['73181900','Servicios de soldadura']`, `['24141500','Suministros para seguridad y protección']`, `['23152206','Protección de barrera']`, `['31161500','Tornillos']`) y estas pruebas:
  - `'busca por palabra específica sin acentos ni plural'`: `suggestSatCandidates('Cilindros neumáticos 40 mm', FAKE)[0].code === '27131703'`.
  - `'una palabra genérica sola no sugiere nada'`: `suggestSatCandidates('Servicio', FAKE)` → `[]`; `suggestSatCandidates('Herramientas', FAKE)` → `[]`.
  - `'descripción vacía o solo medidas devuelve []'` (Review Focus 1): `''`, `'   '`, `'12 mm'`, `'3/8'`, `'1.5'` → `[]` sin lanzar.
  - `'respeta el límite y no repite claves'`: con `limit = 1` devuelve 1; con la consulta `'protección barrera seguridad'` devuelve ≤ 3 y las claves son únicas, ordenadas por `score` desc.
  - `'descripción enorme se acota'` (Review Focus 5): una consulta de 4000 caracteres (`'placa '.repeat(700)`) termina y devuelve un arreglo; medir que tarda menos de 200 ms con `performance.now()` sobre el catálogo real.
  - `'satChoicesFor: lista de Mary gana y no pide candidatas'`: `satChoicesFor('Fixture estación 2', FAKE)` → `{ suggested: '23153000', candidates: [] }`.
  - `'satChoicesFor: sin lista de Mary y con catálogo devuelve candidatas'`: `satChoicesFor('Barrera de protección', FAKE).suggested === null` y `candidates[0].code === '23152206'`.
  - `'satChoicesFor: sin catálogo'`: `satChoicesFor('Barrera de protección', null)` → `{ suggested: null, candidates: [] }`.
  - `'integración con el catálogo real'`: con `SAT_CATALOG`, `suggestSatCandidates('Reparación de componentes de maquinaria', SAT_CATALOG).map(c => c.code)` incluye `'72151802'`. **Si el resultado real no la incluye en las 3 primeras, cambiar la descripción de la prueba por otra cuya entrada esperada salga (anotar cuál en el commit); no ajustar el algoritmo para forzarlo.**
- [ ] **Step 2: Run** `npx tsx --test shared/satSearch.test.ts` → FAIL.
- [ ] **Step 3: Implement** `shared/satSearch.ts` con las firmas y el algoritmo de arriba.
- [ ] **Step 4: Run** `npx tsx --test shared/satSearch.test.ts` → todas PASS.
- [ ] **Step 5: Commit** `feat(sat): buscador de claves candidatas sin IA`.

---

### Task 4: Validación en el servidor y `inList`

**Files:**
- Create: `shared/satCatalogServer.ts`
- Modify: `shared/invoiceRequests.ts`, `server.ts`, `functions/src/index.ts`
- Test: `shared/invoiceRequests.test.ts`

**Interfaces:**
- Consumes: `SAT_CATALOG` (Task 2); `isSatOhdCode` (`shared/satOhd.ts`).
- Produces:
  `shared/satCatalogServer.ts`: `export const isKnownSatCode: (code: string) => boolean` (Set construido una vez con las claves de `SAT_CATALOG`).
  `shared/invoiceRequests.ts`: `SatKey` pasa a `{ lineId: number; name: string; code: string; inList: boolean }`; el contexto de `createInvoiceRequests(state, drafts, orders, ctx)` gana `isKnownSatCode?: (code: string) => boolean`; `attachSatKeys` y `buildRequest` reciben ese predicado.

Reglas: una clave del draft se acepta si `isSatOhdCode(code)` (→ `inList: true`) o, si el contexto trae `isKnownSatCode`, si `isKnownSatCode(code)` (→ `inList: false`). Si no, `{ reason: 'La clave SAT <code> de <name> no existe en el catálogo.' }` cuando hay predicado, o el motivo actual (`...no está en el catálogo de OHD.`) cuando no lo hay. `parseRequest` lee `inList` de cada `satKeys` y, si falta, lo pone en `true`. `parseSatKeysBody` no cambia (el cliente manda solo códigos; `inList` lo calcula el servidor). La prueba de clave inválida cambia de código `12345678`: sigue sin existir en el catálogo recortado, verificar con `isKnownSatCode`.

- [ ] **Step 1: Write the failing tests** en `shared/invoiceRequests.test.ts` (con `ctx` que añade `isKnownSatCode: code => code === '23152206' || code === '99999999'`... usar el predicado real `isKnownSatCode` importado de `./satCatalogServer.ts` en una de ellas):
  - `'OHD: clave del catálogo fuera de la lista se guarda con inList false'`: factura de `ohd` con `satKeys` `[{lineId:31, code:'23152206'}, {lineId:32, code:'23153035'}]` → `created[0].satKeys` es `[{lineId:31, name:'Fixture', code:'23152206', inList:false}, {lineId:32, name:'Placa', code:'23153035', inList:true}]`.
  - `'OHD: clave inexistente se rechaza aunque haya catálogo'`: código `'00000000'` → `created.length === 0`, motivo `/no existe en el catálogo/`.
  - `'OHD: sin predicado solo acepta la lista de Mary'`: `ctx` sin `isKnownSatCode` y código `'23152206'` → rechazada con `/no está en el catálogo de OHD/` (comportamiento anterior).
  - `'clave con espacios, minúsculas o 7 dígitos se rechaza'` (Review Focus 2): `' 23153035'`, `'2315303'`, `'2315303A'` → `skipped`.
  - `'solicitudes guardadas sin inList se leen como true'` (Review Focus 3): `normalizeInvoiceRequests` de una solicitud con `satKeys: [{lineId:1, name:'X', code:'23153035'}]` → `satKeys[0].inList === true`.
  - `'isKnownSatCode: reconoce una clave real y rechaza basura'`: `isKnownSatCode('23152206') === true`, `isKnownSatCode('abc') === false`.
- [ ] **Step 2: Run** `npx tsx --test shared/invoiceRequests.test.ts` → FAIL.
- [ ] **Step 3: Implement** `shared/satCatalogServer.ts`; ajustar tipos y `attachSatKeys`/`buildRequest`/`createInvoiceRequests`/`parseRequest` en `shared/invoiceRequests.ts`; en `server.ts` y `functions/src/index.ts`, importar `isKnownSatCode` y añadirlo al objeto de contexto de la llamada a `createInvoiceRequests` (`{ actor, now, newId, isKnownSatCode }`). Actualizar también la prueba existente `'OHD: sin clave o con clave fuera del catálogo no se crea'` si su motivo cambia.
- [ ] **Step 4: Run** `npx tsx --test shared/invoiceRequests.test.ts` + `npm run lint` + `cd functions && npx tsc --noEmit -p .` → PASS, sin errores.
- [ ] **Step 5: Commit** `feat(solicitudes): el servidor acepta claves SAT del catálogo y guarda si están fuera de la lista`.

---

### Task 5: Marca en el correo

**Files:**
- Modify: `shared/invoiceRequest.ts`
- Test: `shared/invoiceRequest.test.ts`

**Interfaces:**
- Consumes: `SatKey.inList` (Task 4) — `MailableRequest.satKeys` pasa a `{ lineId: number; name: string; code: string; inList?: boolean }[]` (opcional para compatibilidad).
- Produces: en texto y HTML, `Clave SAT <código>` seguido de ` (fuera de la lista de OHD, validar)` cuando `inList === false`; sin marca cuando es `true` o falta.

- [ ] **Step 1: Write the failing tests:** `'correo: clave fuera de la lista lleva la marca'`: `satKeys: [{lineId:1, name:'Guarda', code:'23152206', inList:false}]` → `mail.text` coincide `/Clave SAT 23152206 \(fuera de la lista de OHD, validar\)/` y `mail.html` también; `'correo: clave de la lista o sin inList no lleva marca'` (Review Focus 3): con `inList:true` y sin `inList` → `doesNotMatch(/fuera de la lista/)`.
- [ ] **Step 2: Run** `npx tsx --test shared/invoiceRequest.test.ts` → FAIL.
- [ ] **Step 3: Implement** la marca en el helper `sat(...)` de `buildRequestsEmail` (recibir el `SatKey` completo en lugar de solo el código).
- [ ] **Step 4: Run** `npx tsx --test shared/invoiceRequest.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(solicitudes): el correo marca las claves SAT fuera de la lista de OHD`.

---

### Task 6: Selector con candidatas y carga diferida

**Files:**
- Create: `src/hooks/useSatCatalog.ts`
- Modify: `src/components/RequestDialog.tsx` (`SatSelect` y su uso en `OrderRequestCard`)

**Interfaces:**
- Consumes: `satChoicesFor`, `SatCatalog` (Task 3); `isSatOhdCode`, `SAT_OHD_CATALOG` (`shared/satOhd.ts`).
- Produces: `useSatCatalog(enabled: boolean): SatCatalog | null` — con `enabled` verdadero hace `import('../../shared/satCatalogData')` una sola vez (promesa en módulo) y devuelve `SAT_CATALOG`; mientras carga o si falla devuelve `null` (sin lanzar).

Comportamiento de `SatSelect` (props nuevas: `catalog: SatCatalog | null`): calcula `satChoicesFor(lineName, catalog)` con `useMemo`; si hay `candidates`, el `<select>` muestra primero `<optgroup label="Sugeridas del catálogo SAT (fuera de la lista de OHD)">` con `código · nombre` y después la lista de Mary completa; nada preseleccionado (`value` lo sigue gobernando `choice.sat`). Si el `value` actual no cumple `isSatOhdCode`, debajo del selector aparece `Fuera de la lista de OHD: Mary la validará.` en `text-sm text-warning`. El componente padre llama `useSatCatalog(orders.some(o => isOhdPartner(o.partner_name)) && open)` y baja `catalog` hasta `SatSelect`. Si el catálogo es `null`, el selector se comporta como hoy.

- [ ] **Step 1: Implement** `useSatCatalog` y los cambios de `RequestDialog.tsx` siguiendo el comportamiento anterior; mantener tamaños táctiles actuales (`h-11`), tokens de color existentes (`text-warning`, `text-muted-foreground`) y no agregar dependencias.
- [ ] **Step 2: Run** `npm run lint` → sin errores; `npm test` → todas PASS.
- [ ] **Step 3: Verificar el tamaño del paquete:** `npm run build` y confirmar que el catálogo salió en un fragmento aparte (`ls dist/assets | grep -i sat` o buscar `Protección de barrera` en `dist/assets/*.js` y comprobar que **no** está en el archivo `index-*.js` principal). Esperado: aparece solo en un fragmento secundario.
- [ ] **Step 4: Verificación manual** (queda para el usuario si no hay sesión): abrir Admin → Órdenes con una orden de OHD, seleccionar Factura, comprobar que una partida sin sugerencia de Mary muestra el grupo "Sugeridas del catálogo SAT", que elegir una de ahí muestra el aviso y que el envío se habilita. Con `Network` bloqueando el fragmento, el selector sigue funcionando (Review Focus 4).
- [ ] **Step 5: Commit** `feat(solicitudes): candidatas de clave SAT en el diálogo de OHD`.

---

### Task 7: Documentación y cierre de la Parte 1

**Files:**
- Modify: `CLAUDE.md` (párrafo "Clave SAT (solo OHD)" de la sección "Solicitudes de factura o remisión")

- [ ] **Step 1:** Ampliar el párrafo: catálogo recortado en `shared/satCatalogData.ts` (generado con `scripts/build-sat-catalog.mjs`, regenerar al cambiar divisiones o versión del catálogo), buscador `suggestSatCandidates`, `inList` y la marca del correo, y la regla de que `src/` no importa el catálogo de forma estática.
- [ ] **Step 2: Verificación completa:** `npm run lint`, `npm test`, `cd functions && npx tsc --noEmit -p .`. Esperado: sin errores y todas las pruebas PASS.
- [ ] **Step 3: Commit** `docs: clave SAT sugerida desde el catálogo oficial`. Push y `npm run deploy` solo cuando el usuario lo pida.
