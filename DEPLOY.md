# Deploy del Dashboard SMV (visual-factory-tv-dashboard)

Guía para Emiliano en **Windows** (Galaxy Book). Despliega **solo** Hosting `dashboardsmv` + Functions codebase `visual-factory` del proyecto Firebase `smv-brain`.

**No corras esto hasta tener OK explícito** (auditoría Dieter + OK Emiliano). Este archivo documenta el procedimiento; no autoriza el deploy.

Sitio en vivo: https://dashboardsmv.web.app  
Proyecto Firebase: `smv-brain` (ver `.firebaserc`)  
Comando canónico (desde `package.json` → script `deploy`):

```text
npm run deploy
```

equivale a:

```text
npm run lint && npm test && npm run build && firebase deploy --only hosting:dashboardsmv,functions:visual-factory
```

No uses un `firebase deploy` sin `--only`: el proyecto `smv-brain` lo comparten otras apps.

---

## 1. Requisitos

| Qué | Versión / notas |
|---|---|
| **Node.js** | **22** (igual que CI en `.github/workflows/ci.yml` y `engines` de `functions/package.json`). El README habla de 18+/20+ para desarrollo; para deploy de Functions usa 22. |
| **npm** | El que viene con Node 22. |
| **Firebase CLI (`firebase-tools`)** | Instálalo de forma global o úsalo con `npx`. Doc oficial: [Firebase CLI](https://firebase.google.com/docs/cli). |
| **Cuenta Google** | Con permiso de deploy en el proyecto `smv-brain`. |
| **Git** | Checkout de la rama/commit aprobado (p. ej. el tip de PR #3 o `main` tras el merge). |

Comprobar Node:

```powershell
node -v
# Esperado: v22.x.x
npm -v
```

Instalar / actualizar Firebase CLI (elige una):

```powershell
npm install -g firebase-tools
firebase --version
```

o sin instalar global:

```powershell
npx firebase-tools --version
```

Si usas `npx`, sustituye `firebase` por `npx firebase-tools` en los comandos de abajo.

---

## 2. Login y proyecto activos

Desde la raíz del repo (donde están `firebase.json` y `.firebaserc`):

```powershell
firebase login
firebase use
```

`.firebaserc` define el alias por defecto:

```json
{
  "projects": {
    "default": "smv-brain"
  }
}
```

Debes ver **Active Project: smv-brain** (o el alias `default` apuntando a `smv-brain`). Si no:

```powershell
firebase use smv-brain
firebase use
```

Verifica en `firebase.json` (no lo edites para este deploy):

- Hosting: `"site": "dashboardsmv"`, `"public": "dist"`
- Functions: `"codebase": "visual-factory"`, `"source": "functions"`
- Rewrite `/api/**` → servicio `api` en `us-central1`

`firebase.json` **no** declara `firestore` a propósito: las reglas de `(default)` se despliegan desde SMV Vision. El `--only` de `npm run deploy` tampoco toca Firestore ni Auth.

**No apagues** el proveedor Anonymous de Firebase Auth (decisión Emiliano 9-nov). Este fix solo hace que `/api` rechace tokens anónimos; no cambia la consola de Auth.

---

## 3. Dependencias y build local (opcional pero recomendado)

```powershell
cd ruta\al\visual-factory-tv-dashboard
git status
git rev-parse --short HEAD
npm ci
npm ci --prefix functions
```

Prueba previa (también las corre `npm run deploy`):

```powershell
npm run lint
npm test
npm run build
npm --prefix functions run build
```

Si algo falla aquí, **no** despliegues.

---

## 4. Deploy

Con el proyecto `smv-brain` activo:

```powershell
npm run deploy
```

Eso vuelve a correr lint + tests + `vite build` y luego:

```text
firebase deploy --only hosting:dashboardsmv,functions:visual-factory
```

El `predeploy` de Functions en `firebase.json` ejecuta `npm --prefix "$RESOURCE_DIR" run build` (tsc de `functions/`).

### Cómo ver URL y estado

1. Al terminar, la CLI imprime las URLs de Hosting (debe incluir `https://dashboardsmv.web.app`).
2. Consola Firebase → proyecto **smv-brain** → **Hosting** → sitio **dashboardsmv** → historial de releases (fecha, usuario, estado).
3. Consola → **Functions** → codebase / función **`api`** (región `us-central1`): revisión reciente = este deploy.
4. Abre https://dashboardsmv.web.app con tu cuenta SMV y confirma que la TV/Admin cargan.

---

## 5. Prueba post-deploy (sin pegar tokens en chats)

Base: `https://dashboardsmv.web.app`

### A) Sin token → 401

PowerShell:

```powershell
curl.exe -sS -o body.txt -w "HTTP %{http_code}`n" https://dashboardsmv.web.app/api/odoo/status
Get-Content body.txt
curl.exe -sS -o body2.txt -w "HTTP %{http_code}`n" https://dashboardsmv.web.app/api/odoo/invoiceable-orders
Get-Content body2.txt
```

Esperado: **HTTP 401** y JSON con error de autenticación.

### B) Token anónimo → 403

El proveedor Anonymous debe seguir **habilitado** (no lo desactives). Obtén un ID token anónimo **en tu PC** y **no lo copies a Slack/chat/bitácora**.

Opción recomendada — PowerShell en la raíz del repo (lee la `apiKey` **pública de cliente** desde tu `firebase-applet-config.json` local; esa clave ya viaja en el bundle web, pero **no la pegues en chats** ni en commits). Endpoint documentado: [Firebase Auth REST — Sign in anonymously](https://firebase.google.com/docs/reference/rest/auth#section-sign-in-anonymously).

```powershell
# Desde la raíz del repo — solo en tu máquina
$apiKey = (Get-Content .\firebase-applet-config.json -Raw | ConvertFrom-Json).apiKey
$r = Invoke-RestMethod -Method Post `
  -Uri "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$apiKey" `
  -ContentType 'application/json' `
  -Body '{"returnSecureToken":true}'
$anonToken = $r.idToken
# No hagas Write-Output / echo del token completo
```

Alternativa desde el navegador: abre https://dashboardsmv.web.app → DevTools → **Network** → elige cualquier request a `googleapis.com` / Identity Toolkit que lleve `key=` (o mira el JSON de config del cliente) → usa esa `apiKey` **solo en la consola local** con el mismo `fetch` a `accounts:signUp` y `returnSecureToken: true`. No pegues `apiKey` ni `idToken` en chats.

Prueba:

```powershell
curl.exe -sS -o body-anon.txt -w "HTTP %{http_code}`n" `
  -H "Authorization: Bearer $anonToken" `
  https://dashboardsmv.web.app/api/odoo/status
Get-Content body-anon.txt
```

Esperado: **HTTP 403** (cuenta anónima rechazada).

### C) Cuenta real SMV → 200

1. Entra a https://dashboardsmv.web.app con tu usuario de personal SMV (email/password o SSO).
2. DevTools → **Network**.
3. Dispara una carga que llame `/api/odoo/status` o `/api/odoo/invoiceable-orders`.
4. En la petición, copia el valor de `Authorization: Bearer …` **solo a una variable local** (no al chat).

```powershell
$realToken = "…pegar solo en tu terminal local…"
curl.exe -sS -o body-real.txt -w "HTTP %{http_code}`n" `
  -H "Authorization: Bearer $realToken" `
  https://dashboardsmv.web.app/api/odoo/status
Get-Content body-real.txt
```

Esperado: **HTTP 200** y JSON de estado/órdenes (datos sensibles: no los subas a la bitácora).

Resumen:

| Caso | Código |
|---|---|
| Sin `Authorization` | 401 |
| Bearer token anónimo | 403 |
| Bearer cuenta real SMV | 200 |

---

## 6. Cómo revertir (estándar)

### Hosting (estático / rewrite config)

Documentado por Firebase: [Manage Hosting resources — Roll back](https://firebase.google.com/docs/hosting/manage-hosting-resources).

1. Consola Firebase → **smv-brain** → **Hosting** → sitio **dashboardsmv**.
2. En **Release history**, pasa el cursor sobre el release **anterior** bueno.
3. Menú **⋮** → **Roll back**.

Eso crea un release nuevo que vuelve a servir esa versión. No inventes un comando CLI de rollback: el camino soportado es la consola (la CLI documenta el rollback de Hosting vía esa página del proyecto).

### Cloud Function `api` (codebase `visual-factory`)

Firebase **no** ofrece el mismo “Roll back” de un clic para Functions como en Hosting. Reversión estándar:

1. En tu PC, checkout del commit **anterior** al deploy malo (el tip de `main` previo, o el SHA que estaba en prod).
2. Confirma proyecto: `firebase use` → `smv-brain`.
3. Vuelve a desplegar **con el mismo alcance** que el script del repo:

```powershell
npm ci
npm ci --prefix functions
npm run deploy
```

(o, si prefieres no repetir lint/test porque ya pasaron en ese commit: el script oficial sigue siendo `npm run deploy`; no uses un `--only` distinto al de `package.json`.)

### Qué no hacer al revertir

- No despliegues `firestore` / reglas desde este repo.
- No desactives Anonymous Auth “para arreglar” un 403.
- No subas tokens, `.env`, ni `firebase-applet-config.json` de producción a git ni a chats.

---

## 7. Checklist rápido

- [ ] OK de Emiliano + auditoría Dieter
- [ ] Node 22, `firebase-tools` instalado
- [ ] `firebase login` + `firebase use` → `smv-brain`
- [ ] Rama/commit correctos
- [ ] `npm ci` (+ `functions`)
- [ ] `npm run deploy` OK
- [ ] Hosting URL / release visible en consola
- [ ] Function `api` actualizada
- [ ] curl: 401 / 403 / 200 como arriba
- [ ] Sin secretos en chats ni en commits

