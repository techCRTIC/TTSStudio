# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador, ya completo, vive en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — MVP funcionando, auditado, y con un solo comando para correrlo.
**Last update:** 2026-08-19 (línea de estado)

## Current task
Ninguna en curso. El MVP está cerrado: el usuario abrió la app, generó voz sin
problemas y aprobó el diseño. La auditoría técnica se pasó y sus siete hallazgos
están corregidos.

## Cómo levantarlo
```
npm start        # desde la RAÍZ. Un solo comando.
```
Comprueba y levanta ComfyUI si hace falta, libera el puerto, compila, arranca y
abre el navegador cuando la app ya responde. `Ctrl+C` cierra el servidor de
verdad — ya no deja el proceso huérfano que antes se quedaba con el puerto.

Variantes: `PORT=3001 npm start` · `COMFY_URL=… npm start` · `COMFY_BIN=… npm start`
Otros: `npm run dev` (recarga en caliente) · `npm test` · `npm run build`

Detalle completo y modos de fallo → **`README.md`**.

⚠️ **El servidor lo levanta el USUARIO, en su terminal.** Un `npm start` lanzado
como tarea de fondo de una sesión de agente muere al terminar el turno — pasó
siete veces en la sesión 1 antes de que se viera el patrón, y llevó a decirle al
usuario "está corriendo" cuando ya no lo estaba. Arrancarlo para probar algo
está bien; prometer que sigue vivo, no.

## Dónde quedan los audios
En la salida de ComfyUI (`C:\Users\tech\comfy\output\ttsstudio_NNNNN.flac`), no
dentro del proyecto: la app los referencia por URL en vez de copiarlos. El botón
Descargar deja una copia propia; el historial de la bandeja guarda texto y
enlace, **no** el audio, así que vaciar esa carpeta deja las tomas viejas mudas.

## Lo único no verificado
**El comportamiento en ventanas angostas.** No hubo navegador en la sesión, así
que el responsive se juzgó leyendo el código: no hay anchos fijos, la bandeja
topa en `86vw` y los objetivos táctiles ya llegan a 44px. Pero nadie lo ha
abierto estrecho. Si la app se va a usar solo en el escritorio de esta máquina,
da lo mismo; si no, es lo primero que hay que probar.

## Estado del repositorio
Rama `main`, árbol limpio, veintidós commits. El último: `3cb47f3 feat(web): the
engine's status moved beside the field, and it morphs`.

Salud verificada: 7 tests en verde (2 contra el motor real), build de producción
correcto, `tsc` y `eslint` limpios, y el detector de diseño de `impeccable` sin
hallazgos en dos pasadas.

## Lo construido
| Archivo | Qué es |
|---|---|
| `web/src/app/page.tsx` | La pantalla: escenario central + bandeja lateral |
| `web/src/components/AudioField.tsx` | Campo de audio animado (capas = suma de senoides) |
| `web/src/components/Waveform.tsx` | Onda decodificada del audio real + transporte |
| `web/src/components/VoiceSelect.tsx` | Selector de voz propio (listbox accesible) |
| `web/src/components/ScriptField.tsx` | Área de escritura que crece + desvanecidos |
| `web/src/components/StatusLine.tsx` | Estado del motor con ancho que transforma |
| `web/src/lib/history.ts` | Historial en localStorage vía store externo |
| `web/src/lib/tts.ts` | Grafo Qwen3, envío y lectura de estado |
| `web/src/lib/comfy.ts` | El saneador de cabeceras del ADR-001 |
| `web/src/app/api/…` | `voices`, `generate`, `status/[promptId]`, `comfy/[...path]` |

## Decisiones tomadas
- Identidad, motor, audiencia y alcance → `PRODUCT.md`.
- **ADR-001:** puente a ComfyUI vía proxy propio del lado servidor (403 al
  `Origin` ajeno, medido aislando la variable).
- **ADR-002:** Next.js + TypeScript + Tailwind + shadcn/ui.
- Dirección visual: spinoff oscuro de CRTIC clean, **escenario + bandeja**
  (`concept-seed`, semilla `5006a149`), confirmada tras ver tres bocetos y
  aprobada por el usuario ya construida.
- En oscuro el botón primario lleva tinta grafito: blanco sobre el naranja mide
  3,54 y no pasa AA.
- El historial vive en localStorage: app de un solo usuario, una base de datos
  sería ceremonia.
- La biblioteca de voces se lee del combo de ComfyUI, no de una tabla propia,
  para que no pueda desincronizarse del disco.
- Movimiento reducido **no** es un exterminio global: color, opacidad y sombra
  sobreviven porque son información; lo que se elimina es el movimiento.
- **Los anillos de foco son para lo que se acciona.** Un campo de texto expresa
  el foco a través de la superficie que lo contiene (`.field`), no con un
  rectángulo naranja que a ese tamaño se vuelve el objeto más ruidoso.
- **El tiempo del campo animado se acumula, nunca se lee del reloj.** Leer
  `performance.now()` con el bucle pausado hace que al volver salte. Si alguien
  "simplifica" esto, el fondo vuelve a congelarse y brincar.
- El selector de voz es propio, y **accesible entero**: sustituir un `<select>`
  nativo por algo bonito sin teclado es un peor trato que el control feo.
- **Dos excepciones decididas de animación de maquetación**, no descuidos:
  `transition: height` en `ScriptField` y `transition: width` en `StatusLine`.
  El detector las marca y tiene razón; ambas están razonadas en su propio
  archivo. No "arreglarlas" sin leer eso primero.
- **No se inventan medidores.** Mientras ComfyUI genera no hay progreso medible
  (informa en cola y ejecutando, nada más), así que la interfaz dice eso y no
  finge una barra. Si algún día se hace de puente al websocket del motor, ahí sí
  habrá progreso real que mostrar.

## Próximos pasos
1. **Fase 2 — biblioteca de voces.** Dar de alta una voz nueva desde audio de
   referencia. Hoy solo existe *Andres Bobe* porque ya estaba en disco. El
   servidor ya puede escribir en el `input` de ComfyUI, que era lo difícil.
2. Progreso paso a paso por websocket. El navegador no puede conectarse al de
   ComfyUI por lo mismo del `Origin`, así que hay que hacer de puente desde el
   servidor.
3. `DESIGN.md` del spinoff, escrito desde el mundo ya construido.
4. Probar en ventana angosta.

## Riesgos vivos
- Los bocetos siguen en `.tmp/sketches/`, gitignorado y territorio de purga.
- El audio de Andrés sigue en `comfy-mcp/.tmp/audio/` (61 MB, no regenerable,
  materia prima de la Fase 4). Descartado por el usuario — B-001, cerrado con el
  riesgo asumido y por escrito.
