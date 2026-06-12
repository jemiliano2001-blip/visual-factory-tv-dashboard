import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

/**
 * Serves /.well-known/appspecific/com.chrome.devtools.json on the Vite dev
 * server so Chrome 136+ doesn't log a 404 in the console.
 */
function chromeDevToolsPlugin(): Plugin {
  return {
    name: 'chrome-devtools-well-known',
    configureServer(server) {
      server.middlewares.use(
        '/.well-known/appspecific/com.chrome.devtools.json',
        (_req, res) => {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ version: '1.0' }));
        },
      );
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Reenvía /api al proxy Express de Odoo (server.ts). El frontend usa rutas
  // relativas, así dispositivos en la red local (la TV) llegan al proxy a través
  // del mismo origen del que cargaron la app, sin CORS ni puertos hardcodeados.
  const odooProxy = {
    '/api': {
      target: `http://localhost:${env.ODOO_PROXY_PORT || '3001'}`,
      changeOrigin: true,
    },
  };
  return {
    plugins: [
      // Polyfill Node.js built-ins (stream, events, buffer, util, etc.)
      // required by xlsx-js-style which was built for Node environments.
      // process: false — the process shim would shadow the `define` below,
      // making process.env.GEMINI_API_KEY resolve to undefined in the browser.
      nodePolyfills({ protocolImports: true, globals: { process: false } }),
      chromeDevToolsPlugin(),
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: { enabled: true },
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        },
        manifest: {
          name: 'Visual Factory TV',
          short_name: 'VF TV',
          description: 'Visual Factory TV Dashboard',
          theme_color: '#09090b',
          background_color: '#09090b',
          display: 'standalone',
          icons: [
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: odooProxy,
      headers: {
        // Permissive CSP for dev: allows fonts/images from any source and
        // localhost connections, so the IDE's fonts (Perplexity CDN) and
        // Chrome DevTools probes are not blocked by the PWA Service Worker.
        'Content-Security-Policy':
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline' https:; " +
          "font-src 'self' https: data:; " +
          "img-src 'self' data: blob: https:; " +
          "connect-src 'self' http://localhost:* ws://localhost:* https:; " +
          "worker-src 'self' blob:;",
      },
    },
    preview: {
      proxy: odooProxy,
    },
  };
});
