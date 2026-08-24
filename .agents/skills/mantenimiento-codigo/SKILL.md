---
name: "Mantenimiento General de Código"
description: "Protocolo integral de mantenimiento: optimización de bundles (code-splitting, vendor chunks), endurecimiento de TypeScript estricto, eliminación de vulnerabilidades y dependencias huérfanas, robustez de ciclo de vida 24/7 y verificación de despliegue."
---

# Mantenimiento General de Código

Esta skill proporciona un protocolo estructurado y sistemático para realizar mantenimientos preventivos, correctivos y de optimización en aplicaciones web frontend/fullstack (React, Vite, Node, TypeScript).

---

## 🎯 Los 6 Ejes de Mantenimiento

```
1. Diagnóstico Inicial  ──>  2. Endurecimiento de Tipos  ──>  3. Optimización de Bundle
         │                                                            │
6. Despliegue y Release <──  5. Pruebas y Robustez 24/7  <──  4. Saneamiento Dependencias
```

---

## 1. Fase de Diagnóstico y Línea Base

Antes de modificar cualquier archivo, establece el estado actual del repositorio:

```bash
# 1. Compilación estricta y detección de errores de tipo
npx tsc --noEmit --strict

# 2. Ejecutar suite de pruebas unitarias
npm test # o comando equivalente

# 3. Auditoría de seguridad de dependencias
npm audit

# 4. Medir tamaño actual del bundle de producción
npm run build
```

- Anota el tamaño de los chunks generados (`dist/`) para cuantificar la mejora al final del mantenimiento.

---

## 2. Endurecimiento de TypeScript (`strict: true`)

Convierte el proyecto a **100% Type Safety**:

1. **Habilitar modo estricto** en `tsconfig.json`:
   ```json
   "compilerOptions": {
     "strict": true,
     "isolatedModules": true
   }
   ```
2. **Tipos de desarrollo faltantes**:
   - Verificar si faltan tipos fundamentales como `@types/react`, `@types/react-dom`, `@types/node`.
3. **Type Guards y Predicados de Tipo**:
   - Reemplazar funciones que devuelven `boolean` genérico por predicados de tipo cuando validen estructuras (`user is User`, `err is CustomError`).
4. **Protección de `null` vs `undefined`**:
   - Reemplazar valores inseguros con coalescencia nula (`?? ''`, `?? undefined`) en inputs, selects y llamadas de API.
5. **Cero `any` y `@ts-ignore`**:
   - Eliminar cualquier uso de `any` o supresión de tipos; definir interfaces o usar `unknown` con type narrowing.

---

## 3. Optimización de Rendimiento y Bundler

Reduce el tiempo de carga, consumo de memoria y ancho de banda:

### A. Route-Level Code Splitting
Divide pantallas secundarias (Admin, Estadísticas, Login) del visor principal usando `React.lazy` y `<Suspense>`:

```tsx
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const StatsDashboard = lazy(() => import('./pages/StatsDashboard'));

<Suspense fallback={<LoadingSpinner />}>
  <Routes>...</Routes>
</Suspense>
```

### B. Dynamic Imports para Librerías Pesadas (On-Demand)
Aísla librerías pesadas (ej. exportadores de Excel, parsers de PDF, gráficos complejos) para que solo se descarguen cuando el usuario ejecute la acción:

```tsx
const handleExport = async () => {
  const { exportOrdersToExcel } = await import('../services/exportExcel');
  exportOrdersToExcel(data);
};
```

### C. Vendor Chunks en Vite (`manualChunks`)
Configura `vite.config.ts` para que el Service Worker y el navegador cacheen librerías estables por separado:

```ts
build: {
  rollupOptions: {
    output: {
      manualChunks(id: string) {
        if (id.includes('node_modules')) {
          if (id.includes('firebase')) return 'vendor-firebase';
          if (id.includes('framer-motion')) return 'vendor-motion';
          if (id.includes('@tanstack')) return 'vendor-tanstack';
          if (id.includes('lucide-react')) return 'vendor-lucide';
          if (id.includes('date-fns')) return 'vendor-date-fns';
        }
      },
    },
  },
}
```

---

## 4. Saneamiento de Dependencias y Seguridad

1. **Eliminar Dependencias Huérfanas o Redundantes**:
   - Revisar `package.json` contra el código (`grep` de imports).
   - Eliminar paquetes obsoletos o duplicados (ej. `motion` junto con `framer-motion`, o librerías de utilidades duplicadas).
2. **Aplicar Parches de Seguridad Seguros**:
   ```bash
   npm audit fix
   # Para subproyectos/functions:
   npm --prefix functions audit fix
   ```
3. **Validación de Lockfile**:
   - Ejecutar `npm install` tras modificar `package.json` para garantizar un árbol de dependencias limpio.

---

## 5. Robustez de Ciclo de Vida y Limpieza 24/7

Especialmente crítico para tableros, kioscos y pantallas de planta que operan sin recargar durante días:

1. **Limpieza de Observadores y Timers al Desmontar**:
   - Garantizar que `ResizeObserver`, `IntersectionObserver` y `MutationObserver` invoquen `disconnect()`.
   - Limpiar todos los `setInterval` y `setTimeout` mediante `return () => clearTimeout(timer)`.
2. **Web Speech API y AudioStreams**:
   - Abortar sesiones de reconocimiento de voz activas (`recognition.abort()`).
   - Liberar o suspender fuentes de `AudioContext` en curso para evitar fugas de hardware.
3. **Reconexión Resiliente**:
   - Evitar que errores de red o polling detengan la aplicación; usar fallbacks visuales elegantes y reintentos silenciosos.

---

## 6. Unificación de Pruebas y Pipeline de Verificación

1. **Script de Test Unificado**:
   Configurar en `package.json`:
   ```json
   "test": "tsx --test \"src/**/*.test.ts\" \"shared/**/*.test.ts\""
   ```
2. **Pipeline de Verificación Pre-Commit**:
   ```bash
   npm test
   npm run lint
   npm run build
   npm --prefix functions run build # si aplica
   ```
3. **Release y Despliegue**:
   ```bash
   git add .
   git commit -m "refactor: mantenimiento general de codigo y optimizaciones"
   git push origin main
   npx firebase deploy --only hosting
   ```
