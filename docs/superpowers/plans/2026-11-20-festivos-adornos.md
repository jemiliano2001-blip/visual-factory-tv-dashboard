# Festivos: adornos fijos y saludo de entrada, plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada festivo de la TV suma tres adornos fijos animados (guirnalda arriba, lo que cae, escena en el footer) y un saludo a pantalla completa una vez por día al abrir la app.

**Architecture:** Se extiende `HolidayTheme` (`src/services/holidayTheme.ts`) con dos campos de datos (`garland`, `scene`). Las piezas viven en componentes SVG + CSS (`HolidayGarland` dentro del header, `HolidayScene` dentro del footer, `HolidayParticles` ya existente subido de tamaño, `HolidayIntro` montado en `TVDashboard`). La regla "una vez por día" es una función pura probada; el hook solo lee/escribe localStorage.

**Tech Stack:** React 19 + Vite, Tailwind v4 (`src/index.css`), `node:test` vía `tsx --test`, Lucide. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-11-20-festivos-adornos-design.md` (la base ya construida: `holidayTheme.ts`, `useActiveHoliday.ts`, `HolidayParticles.tsx`, chip en `DashboardHeader`, paleta en `GeminiOledBackground`; todo sin commitear).

## Global Constraints
- Solo `transform` y `opacity` en animaciones; nada de `blur` animado.
- `prefers-reduced-motion: reduce`: adornos quietos y visibles; el saludo de entrada **no** sale.
- Solo TV de escritorio (`!isMobile`); Admin, Stats y móvil sin cambios.
- No cambia color, borde ni contenido de tarjetas, badges ni leyenda; nada encima de ellas.
- Sin rojo saturado en paletas (el rojo es "vencida"). Sin dependencias nuevas.
- Textos en español; íconos Lucide, no emoji. Segunda línea del saludo: "Les desea el equipo SMV".
- A 1920×1080 la cantidad de tarjetas por página debe ser igual con y sin festivo (la escena **no** agrega alto al footer).
- Clave de localStorage: `vftv:festivo:visto:<id>:<aaaa-mm-dd>` (fecha local).
- No hacer commit ni deploy: el usuario lo decide al final (regla global).

## Review Focus
- localStorage no disponible o lanza (ventana privada): no truena; el saludo sale una vez por carga. → Task 1.
- Año Nuevo cruza dos días (27 dic–2 ene): la clave cambia cada día, el saludo sale una vez por día. → Task 1.
- TV abierta a medianoche, cambia de festivo: los adornos cambian; el saludo no reaparece hasta recargar. → Task 2.
- La tecla o clic que cierra el saludo no debe además pausar la rotación (Espacio) ni cambiar de página (←/→). → Task 2.
- Los adornos con `pointer-events-none` nunca bloquean botones del header ni clics en tarjetas. → Tasks 4 y 5.

---

### Task 1: Regla "una vez por día" y datos de adornos por festivo

**Files:**
- Create: `src/services/holidayIntro.ts`, `src/services/holidayIntro.test.ts`
- Modify: `src/services/holidayTheme.ts`, `src/services/holidayTheme.test.ts`, `src/hooks/useActiveHoliday.ts`
- Create: `src/hooks/useHolidayIntro.ts`

**Interfaces:**
- Produces (`holidayIntro.ts`): `localDateKey(date: Date): string` ('YYYY-MM-DD' local, con ceros); `introStorageKey(id: HolidayId, date: Date): string`; `shouldShowIntro(input: { stored: string | null; forced: boolean; reducedMotion: boolean }): boolean`.
- Produces (`holidayTheme.ts`): `type GarlandKind = 'luces' | 'serpentinas' | 'banderines' | 'corazones' | 'flores'`; `type SceneKind = 'navidad' | 'ciudad' | 'coronas' | 'globos' | 'macetas'`; `HolidayParticle` suma `'confeti'`; `HolidayTheme` suma `garland: GarlandKind` y `scene: SceneKind`. Mapeo por festivo, en orden navidad, anio-nuevo, reyes, san-valentin, madres: garland `luces, serpentinas, banderines, corazones, flores`; scene `navidad, ciudad, coronas, globos, macetas`; `particle` de Año Nuevo pasa de `destellos` a `confeti`.
- Produces (`useActiveHoliday`): devuelve `{ holiday, now, forced }`, donde `forced` es true si vino de `?festivo=`.
- Produces (`useHolidayIntro.ts`): `useHolidayIntro(holiday: HolidayTheme | null, now: Date, forced: boolean, enabled: boolean): { show: boolean; dismiss: () => void }`. Decide una sola vez al montar.

- [ ] **Step 1: Escribir pruebas que fallan** en `holidayIntro.test.ts`: `localDateKey(new Date(2026, 11, 5)) === '2026-12-05'`; `introStorageKey('navidad', new Date(2026, 11, 5)) === 'vftv:festivo:visto:navidad:2026-12-05'`; las claves de 31 dic 2026 y 1 ene 2027 con `'anio-nuevo'` son distintas; `shouldShowIntro` devuelve `true` con `{stored:null, forced:false, reducedMotion:false}`, `false` con `stored:'1'`, `true` con `stored:'1', forced:true`, y `false` con `reducedMotion:true` aunque `forced` sea true. En `holidayTheme.test.ts` añade: cada festivo de `HOLIDAYS` tiene `garland` y `scene` definidos, y `anio-nuevo` usa `particle === 'confeti'`.
- [ ] **Step 2: Correr** `npx tsx --test src/services/holidayIntro.test.ts src/services/holidayTheme.test.ts`. Esperado: FALLAN (módulo y campos inexistentes).
- [ ] **Step 3: Implementar** `holidayIntro.ts` y los campos nuevos de `holidayTheme.ts` con las firmas de arriba; `useActiveHoliday` calcula `forced = override !== null`.
- [ ] **Step 4: Implementar `useHolidayIntro`** con `useState` perezoso: si `!enabled` o `holiday` es null, `show=false`; si no, lee `window.localStorage.getItem(introStorageKey(...))` y `window.matchMedia('(prefers-reduced-motion: reduce)').matches` dentro de `try/catch` (si lanza, `stored=null`), llama a `shouldShowIntro`, y si debe mostrarse escribe `'1'` en la clave (también con `try/catch`). `dismiss` pone `show=false`.
- [ ] **Step 5: Correr** las mismas pruebas y `npm run lint`. Esperado: pasan y `tsc` sin errores.

### Task 2: Saludo a pantalla completa

**Files:**
- Create: `src/components/HolidayIntro.tsx`
- Modify: `src/index.css` (keyframes `holiday-intro-life`, `holiday-intro-pop`, `holiday-burst`), `src/pages/TVDashboard.tsx`

**Interfaces:**
- Consumes: `HolidayTheme`, `holidayGreeting(theme, date)`, `useHolidayIntro`, `useActiveHoliday` (Task 1).
- Produces: `HolidayIntro: React.FC<{ holiday: HolidayTheme; date: Date; onDone: () => void }>`.

- [ ] **Step 1: Implementar `HolidayIntro`**: capa `fixed inset-0 z-[80]` (sobre modales `z-[70]`), fondo oscuro con degradado radial tomado de `holiday.palette.top[0]`, saludo grande con `font-display` (`text-6xl lg:text-8xl`) y debajo "Les desea el equipo SMV"; 12 destellos de explosión con vectores deterministas (como `HolidayParticles`, sin `Math.random`). Dura 3.5 s con fundido final (clase `holiday-intro` con animación `forwards`); un `setTimeout` de 3500 ms llama `onDone`. Al montar registra `keydown` en fase de captura con `stopPropagation()` + `preventDefault()` y `click` en la capa, ambos llaman `onDone` (así Espacio y flechas no llegan a los atajos de la TV). Limpia listeners y timer al desmontar. `role="status"` con el saludo como texto.
- [ ] **Step 2: Montar en `TVDashboard`**: usa `const { holiday, now: holidayNow, forced } = useActiveHoliday()` y `const intro = useHolidayIntro(holiday, holidayNow, forced, !isMobile)`; renderiza `{intro.show && holiday && <HolidayIntro holiday={holiday} date={holidayNow} onDone={intro.dismiss} />}` al final del contenedor raíz. Con `?festivo=` siempre sale (por `forced`).
- [ ] **Step 3: Verificar** `npm run lint`; en el navegador a 1920×1080, `/?festivo=navidad`: sale 3.5 s, se cierra con clic y con Espacio (la rotación **no** queda en pausa); sin parámetro hoy (20 nov, sin festivo) no sale; con `emulate prefers-reduced-motion` no sale.

### Task 3: Partículas más visibles y confeti

**Files:**
- Modify: `src/components/HolidayParticles.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `HolidayParticle` con el nuevo `'confeti'` (Task 1).

- [ ] **Step 1: Ajustar `HolidayParticles`**: tamaños de 4 a 10 px, pico de opacidad ~0.6 en `holiday-fall` y 0.5 en `holiday-twinkle`, tonos para `'confeti'` oro/plata/índigo/rosa. Mantener 22–26 piezas deterministas, `aria-hidden`, `pointer-events-none`, detrás de las tarjetas (siguen dentro de `GeminiOledBackground`).
- [ ] **Step 2: CSS**: `.holiday-particle--confeti` rectángulo `width: var(--size); height: calc(var(--size) * 0.5)` con `holiday-fall` y rotación; el corazón debe seguir `--size` (con `clip-path` en unidades relativas o un SVG de Lucide `Heart`), sin tamaño fijo de 10×9 px.
- [ ] **Step 3: Verificar** `npm run lint` y captura de `/?festivo=anio-nuevo` y `/?festivo=san-valentin` a 1920×1080: se ven a 3-4 m y ninguna pieza queda encima de una tarjeta.

### Task 4: Guirnalda en el header

**Files:**
- Create: `src/components/HolidayGarland.tsx`
- Modify: `src/components/DashboardHeader.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `GarlandKind`, `HolidayTheme.accent` (Task 1).
- Produces: `HolidayGarland: React.FC<{ kind: GarlandKind }>`.

- [ ] **Step 1: Implementar `HolidayGarland`**: capa `absolute top-full` (cuelga en el margen entre header y rejilla), `pointer-events-none -z-10`, ancho completo con márgenes negativos para salir del padding de la página, alto ≤ 14 px. Piezas por tipo: `luces` (cable ondulado + bombillas amarillo/verde/blanco con parpadeo `opacity` desfasado, más ramas de pino en las dos esquinas superiores detrás del header), `serpentinas` (cintas doradas que oscilan), `banderines` (triángulos de la paleta que se mecen), `corazones` (corazones rosa/lila en cuerda), `flores` (hiedra con flores). Movimiento solo con `transform` y `opacity`; bajo `prefers-reduced-motion: reduce` queda quieta.
- [ ] **Step 2: Montar en `DashboardHeader`** dentro de `<header>`: `{holiday && <HolidayGarland kind={holiday.garland} />}`.
- [ ] **Step 3: Verificar** `npm run lint` y, para los cinco festivos con `?festivo=<id>` a 1920×1080: la guirnalda se ve, el logo, botones y reloj siguen clicables (`pointer-events-none`) y ninguna tarjeta queda cubierta.

### Task 5: Escena en el footer

**Files:**
- Create: `src/components/HolidayScene.tsx`
- Modify: `src/components/DashboardFooter.tsx`, `src/pages/TVDashboard.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `SceneKind`, `HolidayTheme` (Task 1).
- Produces: `HolidayScene: React.FC<{ kind: SceneKind }>`; `DashboardFooter` suma la prop opcional `holiday?: HolidayTheme | null`.

- [ ] **Step 1: Implementar `HolidayScene`**: contenedor `absolute inset-0 -z-10 overflow-hidden pointer-events-none` con un SVG `preserveAspectRatio="xMidYMax slice"` que dibuja una silueta baja (opacidad ~0.55) detrás de la leyenda y los controles. Por tipo: `navidad` (banco de nieve en el borde superior + pinos, casitas con ventanas que brillan y estrella que titila), `ciudad` (siluetas y 3 fuegos artificiales que se expanden y se desvanecen), `coronas` (tres coronas que suben y bajan suavemente y una estrella), `globos` (corazones y globos que flotan), `macetas` (macetas con flores que se mecen). Solo `transform`/`opacity`; quieta con movimiento reducido.
- [ ] **Step 2: Montar** dentro de `<footer>` en `DashboardFooter` (`{holiday && <HolidayScene kind={holiday.scene} />}`) sin tocar su padding ni su alto; `TVDashboard` pasa `holiday={isMobile ? null : holiday}`.
- [ ] **Step 3: Verificar** `npm run lint`; a 1920×1080 y 1366×768 cuenta las tarjetas de la primera página en `/` y en `/?festivo=navidad`: el número debe ser **igual**. Revisa que el texto del footer siga legible sobre la escena (contraste) y que el toast del footer no quede recortado.

### Task 6: Documentación y verificación final

**Files:**
- Modify: `DESIGN.md`, `CLAUDE.md`

- [ ] **Step 1: Actualizar docs**: en `DESIGN.md`, ampliar "Temas festivos" con adornos fijos (guirnalda, partículas, escena) y saludo de entrada (una vez por día por equipo, 3.5 s, cierra con clic/tecla, no sale con movimiento reducido) y añadir fila al Decisions Log; en `CLAUDE.md`, actualizar el párrafo de temas festivos con los nuevos componentes y la clave `vftv:festivo:visto:<id>:<fecha>` (con `?festivo=` el saludo siempre sale).
- [ ] **Step 2: Correr** `npm test` y `npm run lint`. Esperado: todo en verde.
- [ ] **Step 3: Revisión visual completa** en el navegador: los cinco festivos a 1920×1080 y la TV sin parámetro (hoy 20 nov, sin festivo, igual que siempre); movimiento reducido emulado; sin errores nuevos en consola. Resumir al usuario con capturas; no commitear hasta que lo pida.
