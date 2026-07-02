# Notificaciones Discord v3 — Design Spec

**Fecha:** 2026-07-02
**Proyecto:** Visual Factory TV Dashboard
**Estado:** Aprobado (sin monto en embeds, por decisión del usuario)
**Spec anterior:** `2026-06-20-discord-notifications-design.md` (v1, canal único)

---

## Contexto

El sistema de notificaciones corre en Cloud Functions (`functions/src/index.ts` + `functions/src/notifications.ts`) y envía todo a un solo canal `#ordenes`. Durante el brainstorm del 2026-07-02 se detectaron dos bugs en producción y se decidió la reestructuración.

### Bugs confirmados

1. **Alertas duplicadas.** `checkThresholds`, `checkEvents` y `sendMorningReport` llaman `saveState(state)` **sin `await`**. Cloud Functions puede terminar la instancia antes de que la escritura a Firestore complete → el estado no se guarda → la misma alerta se re-dispara en el siguiente scan de 30 min. Evidencia: orden `2026/S01224` alertada a las 9:18 y 9:48 del 2026-07-02.
2. **Los 6 reportes programados nunca llegan.** Todos se envían con `thread_name`, que Discord solo acepta en canales foro. `#ordenes` es canal de texto → Discord responde 400 y el error solo se loguea. Confirmado por el usuario: nunca ha visto llegar un reporte.

### Decisiones del brainstorm

- **Audiencia:** solo equipo interno, todos ven todo, nadie tiene clientes asignados.
- **Canal por compañía: descartado.** Agregaría mantenimiento por cliente nuevo (canal + webhook + redeploy) sin que nadie filtre por cliente. Se descarta también el canal foro con hilo por cliente y los roles por cliente.
- **Estructura elegida: canales por tipo de mensaje** (estructura fija que no crece con los clientes).
- **Sin montos de dinero en Discord** (decisión explícita del usuario).

---

## Estructura de canales y ruteo

Tres canales, cada uno con su webhook. **Regla de degradación:** si un webhook no está configurado, ese tráfico cae al principal (`DISCORD_WEBHOOK_URL`). Si el principal falta, las notificaciones quedan desactivadas (comportamiento actual, sin cambios).

| Canal | Env var | Recibe |
|-------|---------|--------|
| `#criticas` | `DISCORD_WEBHOOK_URL_CRITICOS` (existente) | Umbrales 14d / **21d (nuevo)** / 30d, órdenes estancadas, cliente con 3+ atrasadas |
| `#ordenes` | `DISCORD_WEBHOOK_URL` (existente) | Nueva orden grande, entrega parcial, entregada, recuperada |
| `#reportes` | `DISCORD_WEBHOOK_URL_REPORTES` (nueva) | Matutino, mediodía, cierre de turno, cierre de semana, resumen semanal, mensual |

### Implementación

Nuevo tipo en `notifications.ts`:

```ts
export interface WebhookChannels {
  eventos: string;   // DISCORD_WEBHOOK_URL
  criticas: string;  // DISCORD_WEBHOOK_URL_CRITICOS || eventos
  reportes: string;  // DISCORD_WEBHOOK_URL_REPORTES || eventos
}
```

- `runNotificationTask` (`index.ts`) construye `WebhookChannels` desde env vars con los fallbacks y lo pasa a las tareas.
- `checkThresholds(orders, channels)` — todos los umbrales van a `channels.criticas`. Desaparece el flag `useCrit` (la variable `DISCORD_WEBHOOK_URL_CRITICOS` cambia de "solo 30d" a "todo lo crítico").
- `checkEvents(orders, channels)` — eventos de ciclo de vida a `channels.eventos`; cliente 3+ y estancadas a `channels.criticas` (los helpers internos `checkPartialDelivery` y `checkStalledOrders` reciben la URL que les corresponde).
- **Los 6 reportes conservan su firma `(orders, url)`** — `index.ts` les pasa `channels.reportes`. Así `test-notifications.ts` sigue funcionando sin cambios de firma.

---

## Política de menciones

- **`#criticas`:** se conserva `getClientMention()` (rol por cliente si existe, si no `@everyone`). Sin cambios.
- **`#reportes`:** hoy matutino/semanal/mensual pingean `@everyone` a diario. Nuevo comportamiento: si `DISCORD_ROLE_GENERAL` está configurado se menciona ese rol; **si no, sin mención** (antes caía a `@everyone`).
- **`#ordenes` (eventos):** sin mención (como hoy).

---

## Embeds enriquecidos

`NotifOrder` gana dos campos que ya vienen en `NormalizedInvoiceableOrder` (no se toca `shared/odooClient.ts`):

```ts
main_product: string;
commitment_date: string | null; // "YYYY-MM-DD HH:MM:SS" UTC de Odoo
```

Las alertas de orden (umbral, estancada, parcial, entregada, recuperada, nueva grande) agregan a su descripción:

- 🔩 **Producto principal**, truncado a 60 caracteres.
- 📅 **Compromiso** cuando `commitment_date` existe: fecha `DD/MM/YYYY`; si ya venció, `"vencido hace N días"` (días calendario). Parseo con la convención local del módulo: `new Date(str.replace(' ', 'T') + 'Z')`.
- 🔗 **`[Ver en tablero](DASHBOARD_URL)`** — nueva env var `DASHBOARD_URL`, default `https://dashboardsmv.web.app`.
- **Sin monto ni datos financieros** (excluido explícitamente).

---

## Señales nuevas

### Umbral de 21 días

Entrada nueva en el array de umbrales de `checkThresholds`:

```ts
{ days: 21, key: '21d', color: 0xB91C1C, title: '🚨 Orden atrasada — 3 semanas' }
```

Misma semántica que 14d/30d: se dispara una sola vez por orden (clave `orderId_21d` en `sentAlerts`), con etiqueta de tendencia mensual. **Comportamiento conocido al desplegar:** las órdenes que ya superan 21d recibirán su alerta 21d una vez en el primer scan (correcto: están atrasadas y nunca fueron alertadas de ese nivel).

### Umbral de orden grande configurable

`DISCORD_LARGE_ORDER_LINES` (entero, default `5` = comportamiento actual), leído igual que `STALL_THRESHOLD_DAYS`.

### Gráfica en el resumen semanal

- `DiscordEmbed` gana `image?: { url: string }`.
- `sendWeeklySummary` construye una URL de QuickChart (`https://quickchart.io/chart?w=500&h=300&c=<config JSON url-encoded>`) — cero dependencias nuevas.
- Datos, últimas 8 semanas ISO: barras = entregas por semana (conteo de `state.deliveryTimestamps[*].detectedAt`, que ya retiene 90 días); línea = críticas al lunes (`state.weeklyBaselineOverdue`). Ambas series ya existen en el estado y tienen datos reales (el baseline se registraba aunque el envío del reporte fallara).
- Semanas sin dato se muestran en 0 (barras) o se omiten (línea).
- **Degradación:** si QuickChart está caído, Discord simplemente no muestra la imagen; el texto del embed llega igual.

---

## Fixes y salud del estado

1. **`await` en todos los `saveState`** de `notifications.ts`: `checkThresholds` (línea ~305), `checkEvents` (~479) y `sendMorningReport` (~514). Elimina la causa raíz de los duplicados.
2. **Quitar `thread_name` en los 6 call sites de reportes.** `sendWebhook` conserva su parámetro opcional `threadName` (no se rompe la firma ni `test-notifications.ts`); simplemente ya nadie lo pasa.
3. **Poda de `weeklyBaselineOverdue`:** hoy crece sin límite. `pruneDeliveryHistory` (el hook de poda que corre en cada `saveState`) recorta a las últimas 12 semanas.

---

## Variables de entorno (`functions/.env`)

```
# Existentes
DISCORD_WEBHOOK_URL=            # canal #ordenes (eventos) + fallback global — requerido
DISCORD_WEBHOOK_URL_CRITICOS=   # canal #criticas — opcional, cambia de "solo 30d" a "todo lo crítico"
DISCORD_ROLE_GENERAL=           # opcional — rol a mencionar en reportes (sin él: sin mención)
STALL_THRESHOLD_DAYS=3          # existente
NOTIFICATIONS_ENABLED=true      # existente

# Nuevas
DISCORD_WEBHOOK_URL_REPORTES=   # canal #reportes — opcional (fallback a principal)
DISCORD_LARGE_ORDER_LINES=5     # umbral de "orden grande"
DASHBOARD_URL=https://dashboardsmv.web.app  # link "Ver en tablero" en embeds
```

## Pasos de configuración del usuario (una sola vez)

1. Crear en Discord los canales `#criticas` y `#reportes`, cada uno con un webhook (Ajustes del canal → Integraciones → Webhooks).
2. Pegar las dos URLs en `functions/.env`.
3. Redeploy: `firebase deploy --only functions`.

---

## Cambios por archivo

| Archivo | Cambio |
|---------|--------|
| `functions/src/notifications.ts` | `await saveState` (3 sitios), `WebhookChannels`, ruteo, umbral 21d, embeds enriquecidos, `NotifOrder` +2 campos, quitar `thread_name` en reportes, mención de reportes sin fallback a `@everyone`, gráfica QuickChart, poda de `weeklyBaselineOverdue`, `DISCORD_LARGE_ORDER_LINES` |
| `functions/src/index.ts` | `runNotificationTask` construye `WebhookChannels`; firmas actualizadas de `checkThresholds`/`checkEvents`; reportes reciben `channels.reportes` |
| `test-notifications.ts` | Comando nuevo `chart` (previsualiza el resumen semanal con gráfica); comandos existentes sin cambios |
| `functions/.env.example` | Nuevas variables documentadas |
| `.env.example` | Nuevas variables documentadas (paridad con functions) |
| `docs/DEPLOY.md` | Sección de Discord actualizada (3 canales + variables) |

**No se tocan:** `shared/odooClient.ts`, `server.ts`, frontend (`src/`), `firestore.rules` (el doc `config/notification_state` ya existe y solo lo escribe el Admin SDK, que no pasa por rules).

---

## Manejo de errores

Sin cambios de postura: webhook fallido se loguea y no se reintenta (salvo el retry de 429 existente); scan fallido se salta al siguiente ciclo; estado corrupto cae a `EMPTY_STATE`. La novedad es la degradación de canales (fallback al principal) y de la gráfica (embed sin imagen).

---

## Testing y gates

- `npm run lint` (tsc raíz) y compilación de functions (`npm --prefix functions run build` o el predeploy de Firebase).
- Smoke manual con `test-notifications.ts` (`ping`, `morning`, `weekend`, `monthly`, `chart`) apuntando a un canal de prueba antes del deploy.
- No hay test runner en el repo (según CLAUDE.md); la validación es compilación + smoke.

---

## Fuera de alcance

- Canal por compañía / roles por cliente / foro con hilo por cliente (descartado por audiencia).
- Aviso por día de entrega del cliente — `CompanyConfig.delivery_schedule` es texto libre; requeriría reestructurar la config y su UI de Admin. Candidato a fase futura.
- Bot bidireccional (slash commands) — salto de complejidad webhook → bot con token y hosting.
- Montos o datos financieros en Discord.
- Retries adicionales de webhooks fallidos.
