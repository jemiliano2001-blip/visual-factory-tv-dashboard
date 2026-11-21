# Fase 3: configuración por cuenta — plan

Spec: `docs/superpowers/specs/2026-11-21-fusion-vision-toolcrib-design.md` (sección Fase 3).

**Meta:** `user_settings/{uid}` guarda vista de inicio, cliente que sigue, impresión y apariencia; sigue a la persona en cualquier compu.

## Rulings (decididos al planear)
- `followedClients` es lista en el esquema (máx. 10), pero el filtro de cliente del Admin es de un solo valor: solo se aplica como filtro inicial cuando hay **exactamente uno**; con varios no se prefiltra. Costo si es error: seguir varios clientes aún no filtra.
- Tema y densidad siguen en localStorage como caché local; al cargar la cuenta se aplican y los botones existentes también guardan en la cuenta.
- La TV (`/`) sigue en localStorage.
- Reglas: se agregan en `apps/SMV-VISION/firestore.rules` (dueño actual) y en la copia de este repo. Sin deploy.

## Tareas
1. `src/services/userSettings.ts` (puro) + pruebas: `DEFAULT_USER_SETTINGS`, `sanitizeUserSettings`, `seedUserSettings`, `startFiltersFor`.
2. `src/services/userSettingsStore.ts` + `src/hooks/useUserSettings.ts`: leer/guardar (setDoc con los 6 campos exactos), siembra si no hay documento.
3. UI: `MyAccount.tsx` en Configuración; arranque del Admin (vista + cliente) y apply de tema/densidad; el diálogo de impresión toma copias y ficha de la cuenta.
4. Reglas `user_settings` (ambos archivos). Suite, lint, build, commit.

## Review Focus
- Documento con campos basura o fuera de rango → defaults, nunca rompe la pantalla.
- Link con parámetros manda sobre la vista de inicio.
- Cuenta sin documento: se siembra desde localStorage, no se pierde la apariencia actual.
- Falla de lectura/escritura: el Admin sigue funcionando con defaults.
