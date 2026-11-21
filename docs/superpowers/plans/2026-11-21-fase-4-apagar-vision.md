# Fase 4: apagar SMV Vision — plan

Spec: `docs/superpowers/specs/2026-11-21-fusion-vision-toolcrib-design.md` (sección Fase 4). **Este plan corrige la spec en un punto (ver Hallazgos).**
Regla de la fase: quien construye **nunca despliega ni borra**. Cada paso marcado 🔒 lo ejecuta Emiliano (o lo autoriza por separado, con el comando exacto a la vista).

## Hallazgos de la exploración (2026-11-21)
1. **Storage no es de Vision, es de SMV Hub.** Las reglas de Storage desplegadas (leídas con la herramienta de Firebase, solo lectura) son las del Hub: helpers `esUsuarioAutorizado`/`smvHubActivo`, rutas de órdenes, almacén, caja chica, gafetes, y al final los bloques `tool-crib/` y `toolcrib/` "compartidos con SMV-VISION". El `storage.rules` de Vision (más estricto) **no es** lo que está desplegado. Desplegar Storage desde este repo o desde Vision borraría las reglas del Hub. → **La Fase 4 no toca Storage.** Se quita de la spec el "traer `storage.rules`".
   - Efecto secundario a reportar al Hub (fuera de alcance): en lo desplegado, `tool-crib/` pide solo `request.auth != null`, o sea que una sesión **anónima** (la TV) puede leer y escribir planos. El dashboard sube planos desde cuentas reales, así que endurecerlo a "no anónimo" no lo rompe, pero es cambio en el repo del Hub.
2. **Firestore `(default)`: no pude leer lo desplegado.** La herramienta devolvió las reglas del Hub (`usuarios`, `ordenes`…, 2,201 líneas, ninguna `toolcrib*` ni `company_configs`), que parecen ser de la base nombrada `compras-americanas`, no de `(default)`. No hay `gcloud` ni sesión aquí para consultar el release. → Paso 1 manual (🔒 solo lectura) para traer las desplegadas y compararlas.
3. **Functions de Vision a apagar** (codebase `smv-vision`): `syncSuprajitOrders` (programada), `triggerOdooSync` y `analyzeGemini` (callables). Las demás functions listadas son del Hub (v1, `ssr*`) o de este dashboard (`api`, `scanNotifications`, reportes): no se tocan.
4. **Este repo no lee nada de lo que llena el sync de Vision** (`odooSaleOrders`, `syncMeta`, `workOrders`, `analysisRuns`, `purchases`, `toolingPurchases`, `toolcribSets`: 0 coincidencias en `src/`, `shared/`, `functions/src/`, `server.ts`). Sí usa `toolcribParts`, `toolcribDrawings`, `toolcribPrintLogs`, `partAliases`, `company_configs` y ahora `user_settings`.
5. La regla `user_settings` (Fase 3) está sin desplegar. Si el dueño de `(default)` pasa a ser este repo, **un solo deploy desde aquí** la publica junto con el resto.

## Rulings (decididos al planear)
- Un solo dueño de `(default)`: este repo. `firestore.rules` pasa a ser la unión completa de las reglas de Vision (ya contiene `company_configs` y `user_settings`) y la copia de referencia actual se reemplaza. Costo si es error: si lo desplegado difiere de Vision, se pierde acceso a alguna colección → por eso el Paso 1 (comparar) va antes de tocar nada.
- Colecciones de módulos apagados (`odooSaleOrders`, `syncMeta`, `workOrders`, `analysisRuns`, `purchases`, `toolingPurchases`, `toolcribSets`, `toolcribPartNotes`): `allow read: if isRealUser(); allow write: if false;`. Datos intactos; lectura abierta a cuentas reales solo para poder exportarlos. Costo si es error: nada se pierde; se reabre con una regla.
- `npm run deploy` **no** incluye `firestore`: el deploy de reglas es un comando aparte y explícito (`--only firestore:rules`), para que un deploy rutinario nunca reemplace reglas compartidas por accidente.

## Tareas

### Task 1: Línea base de reglas desplegadas 🔒 (solo lectura)
- Emiliano trae las reglas vigentes de `(default)`: Consola Firebase → Firestore → base `(default)` → Reglas → copiar a `docs/superpowers/specs/firestore-rules-default-desplegadas-2026-11-21.txt` (o consultar el API `firebaserules` con `gcloud auth print-access-token`).
- Yo comparo contra `apps/SMV-VISION/firestore.rules` y registro cada diferencia. **Si lo desplegado trae algo que Vision no tiene, se incorpora o se decide dejarlo caer antes de seguir.**
- Verificación: informe de diferencias; cero diferencias sin ruling.

### Task 2: `firestore.rules` y `firebase.json` de este repo como dueños
- Files: `firestore.rules` (reemplazo con la unión), `firestore.indexes.json` (copia de Vision), `firebase.json` (agregar `"firestore": {"database":"(default)","rules":"firestore.rules","indexes":"firestore.indexes.json"}`), `shared/firestoreRulesOwnership.test.ts` (invertir).
- Test primero (RED): `firebase.json` declara `firestore` apuntando a `firestore.rules` e índices; `firestore.rules` contiene los `match` de las colecciones que este repo usa (lista explícita) y ninguna colección apagada permite `write`; `package.json` `deploy` no contiene `firestore`; `firebase.json` no declara `storage`.
- Validar con `firebase_validate_security_rules` (sintaxis) y, si hay Java, correr `apps/SMV-VISION/tests/firestore-rules.emulator.test.ts` contra el archivo nuevo.
- Verificación: `npm test`, `npm run lint`, `npm run build` verdes; commit.

### Task 3: Vision deja de ser dueño (cambio en el repo de Vision, sin commitear)
- En `apps/SMV-VISION/firebase.json` quitar `firestore` y `storage`; comentario en sus archivos de reglas ("movidas; no desplegar desde aquí").
- Verificación: `git diff` en Vision; Emiliano lo commitea.

### Task 4: Deploy de reglas desde este repo 🔒
1. Antes: validar sintaxis con la herramienta y revisar el diff contra lo desplegado (Task 1).
2. Emiliano ejecuta: `firebase deploy --only firestore:rules --project smv-brain`.
3. Verificación inmediata con sesión real: Admin (órdenes y `company_configs`), Tool Crib (biblioteca, imprimir), Mi cuenta (guardar), TV en `/`, y SMV Hub. Si algo falla, restaurar el release anterior desde Consola → Reglas → historial (reversible).

### Task 5: Apagar lo de Vision 🔒 (cada paso con aprobación explícita y comando a la vista)
- 5a. Congelar: confirmar unos días que nadie entra a Vision (hosting `smv-vision`; sin logs nuevos con `origin` de Vision).
- 5b. Hosting: `firebase hosting:disable --site smv-vision` (reversible redesplegando).
- 5c. Functions: `firebase functions:delete syncSuprajitOrders triggerOdooSync analyzeGemini --region us-central1 --project smv-brain` (**irreversible** salvo redesplegar desde el código de Vision, que se conserva).
- 5d. Secreto de Gemini: retirarlo de Secret Manager solo después de 5c y confirmar que ninguna otra app lo usa (**irreversible**).
- Opcional antes de 5c: exportar copia de `odooSaleOrders`/`workOrders`/`purchases`. Las colecciones no se borran.

### Task 6: Documentar
- `CLAUDE.md` del repo: sección "Firestore rules" (dueño aquí, deploy aparte, Storage es del Hub) y mención de Tool Crib/planos/`user_settings`.
- Nota con el comando de restauración y el estado de cada paso 🔒.
- Verificación: `npm test` verde; commit.

## Review Focus
- Una colección que Vision usa y esta unión omite → permiso denegado en Vision mientras siga encendido. Prueba: lista de colecciones esperadas en el test de dueño.
- Anónimo (TV) con acceso a algo nuevo: `isRealUser` en todo lo nuevo.
- Un deploy rutinario (`npm run deploy`) que arrastre `firestore`: el test lo prohíbe.
- `user_settings`: solo el propio uid, campos exactos.
- Reglas del Hub intactas: no se toca Storage ni la base `compras-americanas`.

## Qué necesito de Emiliano
1. Task 1: guardar las reglas desplegadas de `(default)`.
2. Decidir las fechas de 5b–5d (no hay prisa; el plan funciona con Vision encendido hasta 5b).
