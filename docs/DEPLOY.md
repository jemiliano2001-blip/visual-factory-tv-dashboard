# Despliegue — Visual Factory TV (solo personal SMV)

Arquitectura: **un solo origen**. `server.ts` sirve el frontend compilado (`dist/`)
y el proxy de Odoo/IA (`/api/*`) en el mismo puerto (3001). Cloudflare Tunnel lo
expone al exterior. La seguridad de acceso la da **Firebase Authentication**:
la TV usa sesión **anónima** (sin login visible) y admin/stats usan email/contraseña.
Todos los endpoints `/api/*` exigen un Firebase ID token válido.

```
Navegador / TV  ──HTTPS──>  Cloudflare Tunnel  ──>  host:3001
                                                      ├── /            → dist/ (SPA)
                                                      └── /api/*       → Odoo + Gemini (verifica Firebase ID token)
```

**TV del taller:** no requiere login visible — `App.tsx` hace `signInAnonymously()` al cargar.
Habilita **Anonymous** en Firebase Console → Authentication → Sign-in method.
Si falla, el tablero muestra un error claro (no intenta llamar a Odoo sin token).

**Admin/Stats:** cuenta real con email/contraseña creada en Firebase Console.

---

## 1. Variables de entorno en el host

Crea `.env.local` en el host (NO se sube a git) con:

```bash
NODE_ENV=production

# Odoo — usa un usuario DEDICADO de solo-lectura, no una cuenta personal
ODOO_URL=https://system.maquinadosvazquez.com
ODOO_DB=db_odoo
ODOO_USERNAME=tablero_readonly@maquinadosvazquez.com
ODOO_PASSWORD=<contraseña fuerte y nueva>
ODOO_PROXY_PORT=3001

# Gemini (features de IA)
# Nota: La API key ya NO se expone en el código frontend por seguridad. 
# Solo el servidor Express (server.ts) la lee para fungir como proxy seguro hacia Google.
GEMINI_API_KEY=<tu key de Gemini>

# Discord (notificaciones)
DISCORD_WEBHOOK_URL=<webhook>
NOTIFICATIONS_ENABLED=true

# Firebase — el servidor la usa para verificar los ID tokens del login.
# Cópiala de firebase-applet-config.json (campo "apiKey") o de Firebase Console.
FIREBASE_API_KEY=<apiKey de firebase-applet-config.json>

# Solo dev local (opcional): bypass de token en 127.0.0.1. NO usar en producción.
# DEV_AUTH_BYPASS=true
```

> `API_SECRET` / `VITE_API_SECRET` ya no existen — la autenticación la hace
> Firebase. El frontend envía el ID token de la sesión (anónima en TV, real en admin);
> el servidor lo verifica contra Google. **No hay secretos de autenticación en el bundle.**

`firebase-applet-config.json` también debe existir en el host (con la API key nueva).
No está en git — cópialo manualmente.

## 2. Build y arranque

```bash
npm install
npm run build      # genera dist/
npm start          # tsx server.ts → sirve dist/ + /api en :3001
```

Verifica local en el host: `http://localhost:3001` debe cargar el dashboard.

Para que sobreviva reinicios, córrelo con un gestor de procesos (pm2 o un
servicio systemd):

```bash
npm i -g pm2
pm2 start "npm start" --name vf-tablero
pm2 save && pm2 startup
```

## 3. Cloudflare Tunnel

Prerrequisito: el dominio `maquinadosvazquez.com` debe estar en Cloudflare
(plan free sirve). Si no lo está, agrégalo en el dashboard de Cloudflare y
cambia los nameservers del dominio a los que te indique.

En el host:

```bash
# 1. Instala cloudflared (https://pkg.cloudflare.com — hay binario para Windows/Linux)
# 2. Autoriza tu cuenta/dominio
cloudflared tunnel login

# 3. Crea el túnel (genera credenciales en ~/.cloudflared/<UUID>.json)
cloudflared tunnel create vf-tablero

# 4. Apunta un subdominio al túnel
cloudflared tunnel route dns vf-tablero tablero.maquinadosvazquez.com
```

Crea `~/.cloudflared/config.yml`:

```yaml
tunnel: vf-tablero
credentials-file: /ruta/a/.cloudflared/<UUID>.json

ingress:
  - hostname: tablero.maquinadosvazquez.com
    service: http://localhost:3001
  - service: http_status:404
```

Corre el túnel como servicio:

```bash
cloudflared service install
# (o, para probar primero) cloudflared tunnel run vf-tablero
```

## 4. Cloudflare Access (opcional — capa extra)

La autenticación principal es **Firebase** (ver sección 5). Cloudflare Access es
opcional si quieres un gate adicional antes de que el tráfico llegue al host.

En **Cloudflare Zero Trust → Access → Applications → Add an application →
Self-hosted**:

- **Application domain:** `tablero.maquinadosvazquez.com`
- **Identity / login:** activa **One-time PIN** o Google.

**Política 1 — Allow (personal SMV):**
- Action: `Allow`
- Include → `Emails` o `Emails ending in @maquinadosvazquez.com`

**Política 2 — Bypass para la TV del taller (opcional):**
- Action: `Bypass`
- Include → `IP ranges` = IP pública de salida del taller, o un *service token*
  (Access → Service Auth) en el kiosko.

Sin Cloudflare Access, el tablero sigue protegido por Firebase ID tokens en `/api/*`.

---

## 5. Cuentas de usuario (Firebase Console)

1. Entra a [Firebase Console](https://console.firebase.google.com) → tu proyecto → **Authentication**
2. En **Sign-in method**, habilita **Anonymous** (requerido para la TV) y **Email/Password** (admin/stats)
3. En **Users**, crea una cuenta por persona del personal (email/contraseña)
4. La TV del taller no necesita cuenta dedicada: usa auth anónima automática al abrir `/`
5. Para revocar acceso de admin: borra su cuenta en Firebase Console

---

## Checklist final

- [ ] Usuario Odoo dedicado **de solo-lectura** (no la cuenta de una persona)
- [ ] Contraseña de Odoo rotada a una fuerte
- [ ] `NODE_ENV=production` en `.env.local`
- [ ] `FIREBASE_API_KEY` en `.env.local` (igual al campo `apiKey` de `firebase-applet-config.json`)
- [ ] Puerto 3001 **no** abierto a internet (solo lo alcanza el túnel)
- [ ] `firebase-applet-config.json` copiado al host
- [ ] Proveedor **Anonymous** habilitado en Firebase → Authentication → Sign-in method
- [ ] Proveedor **Email/Password** habilitado en Firebase → Authentication → Sign-in method
- [ ] Cuentas de personal creadas en Firebase → Authentication → Users
- [ ] `DEV_AUTH_BYPASS` **no** está activo en producción
- [ ] Reglas de Firestore desplegadas: `firebase deploy --only firestore:rules`
- [ ] HTTPS verificado (Cloudflare lo da automático)
