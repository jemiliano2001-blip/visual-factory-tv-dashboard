# Diseño: fusionar SMV Vision en Visual Factory TV (Tool Crib + planos + config por cuenta)

Fecha: 2026-11-21. Al aprobarse se guarda como `docs/superpowers/specs/2026-11-21-fusion-vision-toolcrib-design.md`.

## Contexto e intención

Emiliano ya casi no usa SMV Vision: los reportes (con Gemini) los dejó de hacer. Lo único que sigue vivo de su trabajo es el **seguimiento de órdenes Tool Crib** (cliente Suprajit: piezas repetitivas cuyo plano ya existe; nunca órdenes de fabricación). Su flujo real:

1. Llega la orden Tool Crib.
2. Imprime el plano **dos veces**: una copia se queda con él (control del pendiente) y otra va con quien corta el material y hace la pieza.
3. Cuando la pieza está hecha, pide factura o remisión (eso ya existe en este dashboard: `RequestDialog`).

Objetivo: una sola app. El dashboard absorbe lo de planos de Vision, la sección Pendientes (que nadie usa) se reemplaza por una vista Tool Crib, la configuración pasa a ser **por cuenta**, y Vision se apaga.

## Metas

- Vista Tool Crib en el Admin con estado por partida derivado de datos reales: **sin imprimir / impreso / entregado (Odoo) / factura o remisión pedida**.
- Ligar cada partida con su plano e imprimirlo estampado con SO, PO, cantidad, número de parte y fecha, en N copias (default 2).
- Registrar cada impresión (quién y cuándo) para marcar "impreso".
- Ligar a mano o subir el plano cuando no haya match o haya ambigüedad.
- Configuración guardada en la cuenta (sigue a la persona en cualquier compu): vista de inicio, clientes que sigue, impresión, apariencia.
- Apagar Vision y desplegar desde este repo las reglas de Firestore y Storage.

## No-metas

- Reportes con Gemini, y cualquier IA (regla vigente del repo).
- Módulos Herramental, Compras, Entregas sin OC y Evidencia de Vision. Nadie los usa: se apagan con Vision y sus datos se conservan.
- Órdenes de fabricación.
- Tablero con estados manuales (por imprimir / en corte / maquinando). Lo terminado lo dice Odoo.
- Mover los planos a adjuntos de Odoo.

## Anti-metas (fallaría aunque "funcione")

- Que se imprima **el plano equivocado** sin avisar. Cuando hay empate o duda, la app pide elegir; nunca toma el primero en silencio, como hace hoy Vision.
- Que un deploy de reglas borre las de otra app. La base `(default)` y Storage de `smv-brain` son compartidos.
- Que el estado de la vista Tool Crib contradiga a Odoo.

## Restricciones

- Proyecto Firebase `smv-brain`, compartido con SMV Hub y SMV Vision. Todo deploy va con `--only`.
- Hoy las reglas de `(default)` se despliegan **desde Vision** (`apps/SMV-VISION/firestore.rules`). Hasta la fase 4, cualquier regla nueva se agrega allá y en la copia de referencia de este repo.
- Interfaz en español, `DESIGN.md` y tokens de `src/index.css`. Ambas rutas, móvil (`useMobile`) y escritorio.
- Pruebas `node:test` (`npm test`) para toda la lógica pura nueva.
- Dependencia nueva probable: `pdf-lib`, la que usa Vision para estampar. Requiere aprobación antes de instalarla.

## Enfoques considerados

- **A. Mudar el módulo de planos de Vision al dashboard (ELEGIDO).** Reusa colecciones (`toolcribParts`, `toolcribDrawings`, `toolcribPrintLogs`, `partAliases`) y los PDF que ya están en Storage (`tool-crib/SUPRAJIT/`), sin migrar datos. Costo: pasar aquí el despliegue de reglas, una vez y con cuidado.
- B. Que el dashboard enlace a Vision: rápido, pero quedan dos apps. Descartado porque va contra el objetivo.
- C. Planos como `ir.attachment` en Odoo: requiere migrar 121 PDF, dar permiso de escritura al proxy y depender de Odoo para imprimir. Más riesgo que beneficio para 43 piezas.

## Diseño por fases (cada fase se entrega y se usa antes de la siguiente)

### Fase 1: Vista Tool Crib (reemplaza Pendientes)

- Tool Crib = órdenes cuyo `partner_name` contiene "SUPRAJIT", la misma regla que Vision (`REPORT_PARTNER_KEY_PREFIX`). Va en una constante con prueba.
- En `src/services/adminSections.ts` se sustituye la sección `pending` por `toolcrib`. En `src/services/adminFilters.ts`, los links viejos (`view=pending`, `tab=pending`, `tab=agenda`) caen en Tool Crib.
- Se borra `src/components/admin/PendingTab.tsx`. **Se conserva** `src/services/pendingItems.ts`, que usan `OrdersTable`, `StatsDashboard` y `exportExcel`.
- La vista muestra, por partida con cantidad pendiente: SO, PO (`customer_reference`), número de parte (sacado de `[...]` en la descripción), descripción, faltan / entregado, compromiso y estado. Reusa `OrderPoEngineer`, `RequestDialog` y la selección múltiple existente.
- Estado derivado (función pura, probada): `entregado` y `solicitud pendiente` salen de datos que ya existen (`stock.move` y `invoice_requests`). `impreso` llega en la fase 2. Mientras tanto la columna dice "—".

### Fase 2: Planos (ligar, imprimir, marcar impreso)

- **Lectura de la biblioteca:** se porta el acceso de solo lectura de `apps/SMV-VISION/src/lib/firebase/toolcrib.ts` (vista parte + plano activo, `ToolcribActiveDrawingView`).
- **Ligado:** se porta la regla de `apps/SMV-VISION/src/lib/matching.ts` y `src/lib/visionPipeline/fetchOrdersAndMatch.ts`, en este orden de prioridad: vínculo o alias en `partAliases`, después número de parte exacto, después parecido aproximado con un mínimo de 80. **Cambio respecto a Vision:** si dos o más candidatos empatan en el mejor puntaje, la partida queda "ambigua" y no se imprime hasta que alguien elija. El ISO gana sobre el CAD cuando ambos pasan el umbral, igual que en Vision.
- **Impresión:** se porta `apps/SMV-VISION/src/lib/planoOt.ts`, que estampa SO, CANT, FECHA y PO en el plano y opcionalmente agrega la ficha de pizarrón. Se agrega un número de copias (default tomado de la config de la cuenta; 2 para Emiliano). Se imprime por partida o por lote de selección, y se genera un solo PDF que se abre en el diálogo de impresión del navegador. La cantidad por defecto es la pendiente de la partida, editable.
- **Bitácora:** cada impresión escribe en `toolcribPrintLogs` con el esquema que ya existe (`printedByUid` = usuario, hora del servidor y `copies` real). La partida se marca "impreso" si existe un log para su SO y su número de parte. Se muestra "Impreso 21 nov · Emiliano".
- **Sin plano o ambiguo:** desde la partida, "Elegir plano" busca en la biblioteca y guarda el alias en `partAliases`. "Subir plano" sube el PDF a `tool-crib/SUPRAJIT/` y crea `toolcribParts` y `toolcribDrawings` con los validadores existentes. Las reglas de esas colecciones y de Storage ya existen en Vision.
- Sin IA y sin rasterizar con Gemini.

### Fase 3: Configuración por cuenta

- Colección nueva `user_settings/{uid}`. Cada quien lee y escribe solo su documento, con el conjunto exacto de campos validado en reglas (se agregan en Vision y en la copia de aquí).
- Campos:
  - `startView`: id de una sección del Admin.
  - `followedClients`: nombres normalizados con `normalizeCompanyName`. Vacío significa todos.
  - `print`: `{ copies 1–5, boardTicket boolean }`.
  - `appearance`: `{ theme, density }`.
  - `updatedAt`.
- Admin → Configuración gana una sección "Mi cuenta", visible para cualquier usuario real. Los horarios por cliente siguen globales y solo para cuentas con claim `admin`, sin cambios.
- Al entrar sin parámetros en la URL, el Admin abre `startView` con `followedClients` como filtro de cliente. Un link con parámetros siempre manda (el "Copiar link" sigue funcionando igual). **`followedClients` es solo el filtro inicial** de Por compañía y Órdenes, y se quita con un clic. Stats, la TV, los contadores de vencidas y la vista Tool Crib no cambian (decisión de Emiliano).
- **Migración suave:** si la cuenta no tiene documento, se siembra con lo que haya en `localStorage` (`vftv:admin:density`, el tema de `useAdminTheme` y `adminFilters`).
- La TV (`/`) sigue usando `localStorage`: es configuración de la pantalla, no de la persona. *(Decisión de Claude.)*

### Fase 4: Apagar Vision

- Se trae a este repo el `firestore.rules` vigente de Vision completo (incluye `company_configs`, toolcrib, `user_settings` y las colecciones de módulos apagados) y el `storage.rules`. En `firebase.json` se declaran `firestore` y `storage`, y se invierte `shared/firestoreRulesOwnership.test.ts` para que exija que este repo sea el dueño.
- Las colecciones de los módulos apagados quedan con escritura cerrada. Los datos se conservan.
- En Vision se quita `firestore` y `storage` de su `firebase.json`, para que un deploy viejo desde allá no pise las reglas.
- **Pasos irreversibles, con aprobación explícita cada uno:** desactivar el hosting de Vision y borrar sus Functions (`syncSuprajitOrders`, `triggerOdooSync`, `analyzeGemini`). El secreto de Gemini se retira de Secret Manager.

## Decisiones tomadas por Claude (revisar)

- **"Impreso" usa el historial que ya existe.** Las partidas se cruzan con `toolcribPrintLogs` por `orderRef` (SO) + `partId` del plano ligado, así que todo lo que ya se imprimió desde Vision cuenta desde el primer día. La consulta trae los logs de las SO Tool Crib abiertas (consultas `in` por lotes de SO), no "los últimos 300".
- **Sin nombre en el log.** El log solo tiene uid, así que se muestra "Impreso 21 nov" y "por ti" cuando el uid es el tuyo. No se cambia el esquema del log.
- **Se registra al generar el PDF**, igual que en Vision. Reimprimir una partida ya impresa avisa ("ya impreso el …, ¿reimprimir?") y agrega otro log.
- **Ambigüedad:** cada parte tiene un plano activo. Si una parte tiene CAD e ISO no hay ambigüedad; aplica la regla de Vision (ISO primero). Es ambigua solo cuando dos **partes distintas** empatan en el mejor puntaje. Un alias que apunta a un plano inactivo o borrado se trata como "sin plano".
- **Permisos de toolcrib:** se mantiene lo que hay hoy en Vision: cualquier cuenta real (no anónima) del proyecto puede ligar o subir planos. Las reglas no pueden consultar la base `compras-americanas` del Hub para exigir `activo`. Endurecerlo requeriría un claim nuevo, y queda fuera de alcance. `user_settings` es estricto: cada uid solo accede a su documento.
- **Deploys:** quien construya nunca despliega. Cada deploy de reglas (desde Vision en las fases 2 y 3, desde aquí en la 4) lo autoriza Emiliano por separado, con `--only`. La fuente de verdad para la fase 4 son las reglas **desplegadas**: se descargan y se comparan antes de mudarlas.

## Lo que queda al criterio de quien construya

Nombres de componentes y archivos nuevos. Si la lógica portada vive en `shared/` o en `src/services/`. El layout exacto de la vista Tool Crib dentro de `DESIGN.md`. Cómo agrupar el lote de impresión en un solo PDF.

## Verificación por fase

- Fase 1: `npm run lint` y `npm test` (nuevas pruebas de `adminSections`, `adminFilters` y del estado derivado). En el navegador, `/admin?vista=pending` debe caer en Tool Crib, que muestra solo Suprajit.
- Fase 2: pruebas del ligado (match exacto, alias, umbral, empate como "ambiguo"). En el navegador, imprimir una partida debe abrir un PDF de 2 copias con SO, PO y cantidad, y la partida debe pasar a "impreso" tras recargar. Revisar el documento en `toolcribPrintLogs`.
- Fase 3: pruebas de validación de `user_settings` y de la siembra desde `localStorage`. Entrar desde otro navegador con la misma cuenta debe mostrar la misma vista de inicio, los mismos clientes y la misma apariencia.
- Fase 4: `firebase deploy --only firestore:rules,storage` en un dry run primero y comparación con las reglas vigentes. Después, comprobar que SMV Hub, el dashboard y la TV siguen leyendo.
