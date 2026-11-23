# Visual Factory TV Dashboard

Tablero de producción en tiempo real para planta manufacturera, integrado con **Odoo ERP**: vista de TV, consola de administración de solo lectura, estadísticas y alertas a Discord.

## Requisitos Previos

- **Node.js**: 18+ (recomendado 20+)
- **Instancia de Odoo**: Credenciales de acceso con permisos de lectura en `sale.order`.
- **Firebase**: Cuentas reales de Firebase Auth (email/contraseña o SSO desde SMV Hub; sesiones anónimas rechazadas) y Firestore para configuración de horarios, estado operativo y `audit_logs`.

## Configuración Rápida

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno:
   ```bash
   cp .env.example .env.local
   ```
   Completa los valores en `.env.local` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, etc.).

3. Iniciar entorno de desarrollo completo (Vite + Proxy Odoo):
   ```bash
   npm run dev:full
   ```
   Abre [http://localhost:3000](http://localhost:3000) en el navegador.

## Comandos Principales

| Comando | Descripción |
|---|---|
| `npm run dev:full` | Inicia simultáneamente el frontend Vite y el servidor proxy Express |
| `npm test` | Ejecuta la suite completa de pruebas unitarias (`tsx --test`) |
| `npm run lint` | Valida TypeScript en **modo estricto** (`tsc --noEmit`) |
| `npm run build` | Genera el bundle optimizado para producción con Code-Splitting y PWA |
| `npm run deploy` | Corre lint, tests y build y despliega solo `hosting:dashboardsmv` + `functions:visual-factory` (siempre juntos) |
| `npm run preview` | Previsualiza el bundle de producción en local |

## Arquitectura

- **Frontend**: React 19 + Vite + TailwindCSS v4 + Base UI / Shadcn.
- **Proxy Backend**: Servidor Express (`server.ts`) para autenticar llamadas JSON-RPC a Odoo, con caché corto (60 s), rate limiting y validación de Firebase ID token.
- **Firebase Cloud Functions**: API serverless (`/api/*`, health check público `/api/health` para Odoo + Firestore, auditoría en `audit_logs`) y alertas programadas a Discord (`functions/src/notifications.ts`).
