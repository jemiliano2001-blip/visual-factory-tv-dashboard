# Despliegue — Visual Factory TV (solo personal SMV)

Arquitectura: **un solo origen**. `server.ts` sirve el frontend compilado (`dist/`)
y el proxy de Odoo (`/api/odoo/*`) en el mismo puerto (3001). Cloudflare Tunnel lo
expone al exterior. La seguridad de acceso la da **Firebase Authentication** (email
+ contraseña) — no hace falta Cloudflare Access.

```
Navegador / TV  ──HTTPS──>  Cloudflare Tunnel  ──>  host:3001
                                                      ├── /            → dist/ (SPA, requiere login)
                                                      └── /api/odoo/*  → Odoo (verifica Firebase ID token)
```

**Cuentas de acceso:** se crean en Firebase Console → Authentication → Users → Add user.
No es necesario agregar correos en ninguna lista de código — solo las cuentas que existen
en Firebase pueden iniciar sesión. Para la TV del taller, crea una cuenta dedicada
(p. ej. `tv-taller@tuempresa.com`) y déjala con sesión iniciada permanentemente.

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
GEMINI_API_KEY=<tu key de Gemini>

# Discord (notificaciones)
DISCORD_WEBHOOK_URL=<webhook>
NOTIFICATIONS_ENABLED=true

# Firebase — el servidor la usa para verificar los ID tokens del login.
# Cópiala de firebase-applet-config.json (campo "apiKey") o de Firebase Console.
FIREBASE_API_KEY=<apiKey de firebase-applet-config.json>
```

> `API_SECRET` / `VITE_API_SECRET` ya no existen — la autenticación la hace
> Firebase. El frontend envía el ID token de la sesión; el servidor lo verifica
> contra Google. **No hay secretos de autenticación que hornear en el bundle.**

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

## 4. Cloudflare Access (el gate)

En **Cloudflare Zero Trust → Access → Applications → Add an application →
Self-hosted**:

- **Application domain:** `tablero.maquinadosvazquez.com`
- **Identity / login:** activa **One-time PIN** (Cloudflare manda un código al
  correo; cero configuración de IdP). Alternativa: Google.

**Política 1 — Allow (personal SMV):**
- Action: `Allow`
- Include → `Emails` (lista de correos del personal) o `Emails ending in
  @maquinadosvazquez.com` si tienen correo corporativo.

**Política 2 — Bypass para la TV del taller:**
- Action: `Bypass`
- Include → `IP ranges` = IP pública de salida del taller.
- Esto hace que la TV entre sin pedirle login. Si la IP del taller **no es fija**,
  usa en su lugar un *service token* (Access → Service Auth) y configúralo en el
  navegador/kiosko de la TV con los headers `CF-Access-Client-Id` /
  `CF-Access-Client-Secret`.

---

## 5. Cuentas de usuario (Firebase Console)

1. Entra a [Firebase Console](https://console.firebase.google.com) → tu proyecto → **Authentication** → **Users**
2. Habilita el proveedor **Email/Password** en la pestaña Sign-in method (si no está activado)
3. Haz clic en **Add user** y crea una cuenta por persona del personal
4. Crea una cuenta adicional para la TV del taller (p. ej. `tv-taller@tuempresa.com`)
5. Configura esa cuenta en el navegador/kiosko de la TV — déjala con sesión iniciada y la página como homepage

Cuando quieras revocar el acceso de alguien: borra su cuenta en Firebase Console. No hay nada que cambiar en el código.

---

## Checklist final

- [ ] Usuario Odoo dedicado **de solo-lectura** (no la cuenta de una persona)
- [ ] Contraseña de Odoo rotada a una fuerte
- [ ] `NODE_ENV=production` en `.env.local`
- [ ] `FIREBASE_API_KEY` en `.env.local` (igual al campo `apiKey` de `firebase-applet-config.json`)
- [ ] Puerto 3001 **no** abierto a internet (solo lo alcanza el túnel)
- [ ] `firebase-applet-config.json` copiado al host
- [ ] Proveedor **Email/Password** habilitado en Firebase → Authentication → Sign-in method
- [ ] Cuentas de personal creadas en Firebase → Authentication → Users
- [ ] Cuenta de kiosko TV creada y con sesión iniciada en el kiosko
- [ ] Reglas de Firestore desplegadas: `firebase deploy --only firestore:rules`
- [ ] HTTPS verificado (Cloudflare lo da automático)
