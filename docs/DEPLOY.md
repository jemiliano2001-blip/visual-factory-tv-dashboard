# Despliegue — Visual Factory TV (solo personal SMV)

Arquitectura: **un solo origen**. `server.ts` sirve el frontend compilado (`dist/`)
y el proxy de Odoo (`/api/odoo/*`) en el mismo puerto (3001). Cloudflare Tunnel lo
expone sin abrir puertos, y Cloudflare Access lo gatea a correos autorizados.

```
Navegador / TV  ──HTTPS──>  Cloudflare (Access: login SMV)  ──Tunnel──>  host:3001
                                                                          ├── /            → dist/ (SPA)
                                                                          └── /api/odoo/*  → Odoo (bearer API_SECRET)
```

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

# Secreto del proxy — MISMO valor en ambos. VITE_ se hornea al hacer build.
# Genera uno con:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
API_SECRET=<secreto-aleatorio-de-64-hex>
VITE_API_SECRET=<el-mismo-secreto-aleatorio>

# Gemini (features de IA)
GEMINI_API_KEY=<tu key de Gemini>

# Discord (notificaciones)
DISCORD_WEBHOOK_URL=<webhook>
NOTIFICATIONS_ENABLED=true
```

> El frontend manda `VITE_API_SECRET` en el header. Debe ser igual a `API_SECRET`
> y debe estar presente **antes del `npm run build`** (Vite lo hornea en el bundle).

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

## Checklist final

- [ ] Usuario Odoo dedicado **de solo-lectura** (no la cuenta de una persona)
- [ ] Contraseña de Odoo rotada a una fuerte
- [ ] `API_SECRET` y `VITE_API_SECRET` con el mismo valor, build hecho después
- [ ] `NODE_ENV=production`
- [ ] Puerto 3001 **no** abierto a internet (solo lo alcanza el túnel)
- [ ] `firebase-applet-config.json` copiado al host con la API key nueva
- [ ] Política Access "Allow" con los correos del personal
- [ ] Política Access "Bypass" (o service token) para la TV
- [ ] HTTPS verificado (Cloudflare lo da automático)
