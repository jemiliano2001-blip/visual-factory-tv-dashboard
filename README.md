# Visual Factory TV Dashboard

Tablero de producción en tiempo real para planta manufacturera, integrado con **Odoo ERP** y enriquecido con inteligencia artificial de **Google Gemini** (comandos de voz, análisis de riesgo y reportes operativos).

## Requisitos Previos

- **Node.js**: 18+ (recomendado 20+)
- **Instancia de Odoo**: Credenciales de acceso con permisos de lectura en `sale.order`.
- **Google Gemini API Key**: Para funciones de procesamiento de lenguaje natural y TTS.
- **Firebase**: Autenticación anónima y Firestore para configuración de horarios.

## Configuración Rápida

1. Instalar dependencias:
   ```bash
   npm install
   ```

2. Configurar variables de entorno:
   ```bash
   cp .env.example .env.local
   ```
   Completa los valores en `.env.local` (`ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_PASSWORD`, `GEMINI_API_KEY`, etc.).

3. Iniciar entorno de desarrollo completo (Vite + Proxy Odoo):
   ```bash
   npm run dev:full
   ```
   Abre [http://localhost:3000](http://localhost:3000) en el navegador.

## Comandos Principales

| Comando | Descripción |
|---|---|
| `npm run dev:full` | Inicia simultáneamente el frontend Vite y el servidor proxy Express |
| `npm test` | Ejecuta la suite completa de 48 pruebas unitarias (`tsx --test`) |
| `npm run lint` | Valida TypeScript en **modo estricto** (`tsc --noEmit`) |
| `npm run build` | Genera el bundle optimizado para producción con Code-Splitting y PWA |
| `npm run preview` | Previsualiza el bundle de producción en local |

## Arquitectura

- **Frontend**: React 19 + Vite + TailwindCSS v4 + Base UI / Shadcn.
- **Proxy Backend**: Servidor Express (`server.ts`) para autenticar llamadas JSON-RPC a Odoo y mediar peticiones a Gemini.
- **Firebase Cloud Functions**: Endpoint serverless (`functions/src/index.ts`) y alertas programadas a Discord (`functions/src/notifications.ts`).
