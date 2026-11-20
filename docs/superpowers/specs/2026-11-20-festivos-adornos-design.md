# Temas festivos llamativos: adornos fijos y saludo de entrada

Extiende `holidayTheme.ts` (2026-11-20, ya implementado: aurora con paleta, 22 partículas y chip de saludo).

## Intención
Emiliano quiere que en la TV del taller se sienta **todo el rato** el ambiente del festivo, para darle al equipo motivación o alegría, sin dejar de ser una herramienta de trabajo. Hoy el tema casi no se ve: las tarjetas tapan ~85 % de la pantalla y las partículas son chicas y tenues. Pidió dos cosas: **adornos fijos** visibles todo el periodo del festivo y **un momento grande** que ocurra solo una vez al abrir la app (cada 15 min sería molesto).

## Metas
- Que a 3-4 m se note qué festivo es: adornos grandes, animados y con la paleta del festivo.
- Un saludo a pantalla completa, una vez al abrir la app.
- Que las tarjetas sigan leyéndose igual: nada nuevo encima de ellas.

## No-metas
- No cambia el color, borde ni contenido de ninguna tarjeta, badge ni leyenda (el color significa urgencia, `DESIGN.md`).
- No aplica a Admin, Stats ni móvil.
- No hay botón para apagar los temas ni selector manual (sigue siendo automático por fecha, más `?festivo=` para pruebas).
- No hay momento grande periódico.

## Anti-metas (sería un fracaso aunque "funcione")
- Que los adornos tapen una orden, un botón o el reloj.
- Que el equipo pierda una fila o columna de tarjetas por culpa de la decoración.
- Que el saludo de entrada bloquee la TV más de unos segundos o no se pueda cerrar.

## Restricciones
- Equipo de la TV: una PC; Emiliano espera que aguante todas las animaciones. Aun así, solo `transform` y `opacity` (regla de `DESIGN.md`), sin `blur` animado.
- `prefers-reduced-motion: reduce`: los adornos se muestran **quietos** y el saludo de entrada **no sale**.
- Sin dependencias nuevas.
- Sin rojo saturado en las paletas (el rojo es "vencida").
- La rejilla se mide con `ResizeObserver` (`computeTVGrid`); a 1920×1080 debe seguir dando las mismas columnas y filas que sin festivo.

## Enfoques considerados
1. **SVG + CSS por festivo (elegido).** Cada festivo es un conjunto de piezas dibujadas en código y animadas con CSS. Paleta por festivo, casi sin peso, encaja con lo ya construido. Límite: efectos vectoriales, no de video.
2. **Motor de partículas en canvas/WebGL.** Más fluido para nieve y fuegos artificiales, pero mucho más código para mantener y las escenas del pie quedan difíciles. Descartado.
3. **Lottie o imágenes prefabricadas.** Pulidas, pero requieren arte y dependencias externas y no se adaptan a la paleta. Descartado.

Emiliano delegó el "cómo"; la elección es decisión del implementador, no algo que Emiliano haya aprobado.

## Diseño (lo que Emiliano decidió)
Cada festivo lleva **tres adornos fijos juntos** y **un saludo de entrada**:

| Festivo | Guirnalda (arriba) | Lo que cae | Escena (abajo) |
|---|---|---|---|
| Navidad | foquitos que parpadean y ramas de pino | nieve que se acumula | pinos, casitas con ventanas encendidas, estrella |
| Año Nuevo | serpentinas doradas | confeti | ciudad con fuegos artificiales |
| Reyes | banderines | destellos dorados | tres coronas y una estrella |
| San Valentín | guirnalda de corazones | corazones flotando | corazones y globos |
| Día de las Madres | guirnalda de flores | pétalos | macetas con flores |

La tabla de festivos de arriba la propuso el asistente tras ver que Emiliano pidió los tres adornos para Navidad; no la objetó, pero está abierta a cambios. Los de Navidad sí los vio en bocetos.

**Saludo de entrada** (cortinilla a pantalla completa, variante "X" del boceto): el saludo gigante del festivo sobre fondo oscuro con la paleta del festivo y una explosión de destellos, unos 3 s, y vuelve la TV. Se cierra antes con cualquier clic o tecla. Aparece **una sola vez** al abrir la app.

## Mis decisiones (marcadas para que Emiliano las revise)
- **"Una vez al abrir" = una vez por día y por equipo.** Se guarda `vftv:festivo:visto:<id>:<aaaa-mm-dd>` en localStorage. Así la TV prendida en la mañana lo muestra, pero un refresco o la autoactualización de la PWA el mismo día no lo repite. Alternativa: una vez por pestaña (sessionStorage), que repetiría tras cada recarga.
- **El saludo lleva una segunda línea** corta ("Les desea el equipo SMV"). Texto mío de relleno; Emiliano lo cambia si quiere.
- **La escena del pie es más baja que en el boceto.** Se dibuja dentro del alto del footer actual (no agrega alto), como silueta detrás de la leyenda con opacidad moderada, para no quitar filas de tarjetas. El boceto la mostraba de ~16 %; la real es de ~4-5 %. Si Emiliano prefiere una escena grande, cuesta una fila de tarjetas en algunas pantallas.
- **Las ramas y la guirnalda de arriba van detrás del header** (logo, botones, reloj) y en su borde inferior, nunca encima de los controles.
- **La nieve y demás partículas suben de tamaño y opacidad** (hasta ~10 px y ~0.6) y se mantienen detrás de las tarjetas, igual que hoy.
- El saludo y adornos solo salen en TV de escritorio, como el chip actual.

## Qué se deja al implementador
Dibujo exacto de cada SVG, ritmos y duraciones de las animaciones, colores concretos dentro de cada paleta, dónde se monta la capa de adornos (z-index entre el fondo aurora y las tarjetas), y el componente del saludo de entrada. Se reutilizan `HolidayTheme`, `useActiveHoliday`, `GeminiOledBackground` y `HolidayParticles`.

## Cómo se verifica
- Prueba unitaria (`node:test`) de la regla "una vez por día" (puro: dado el id, la fecha y lo guardado, ¿se muestra?).
- `npm test` y `npm run lint`.
- En el navegador a 1920×1080: los cinco festivos con `?festivo=<id>`; las tarjetas, header, reloj y footer no quedan tapados; columnas × filas iguales a las de sin festivo; el saludo sale una vez, se cierra con clic o tecla y no reaparece al recargar el mismo día.
- Con movimiento reducido: adornos quietos y sin saludo.
