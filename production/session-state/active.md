# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador, ya completo, vive en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — MVP funcionando, auditado, y con un solo comando para correrlo.
**Last update:** 2026-08-19 (lanzador `npm start`)

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
Rama `main`, árbol limpio, quince commits. El último: `fd1f39b docs: README
covers npm start and where the audio lands`.

Salud verificada: 7 tests en verde (2 contra el motor real), build de producción
correcto, `tsc` y `eslint` limpios, y el detector de diseño de `impeccable` sin
hallazgos en dos pasadas.

## Lo construido
| Archivo | Qué es |
|---|---|
| `web/src/app/page.tsx` | La pantalla: escenario central + bandeja lateral |
| `web/src/components/AudioField.tsx` | Campo de audio animado (capas = suma de senoides) |
| `web/src/components/Waveform.tsx` | Onda decodificada del audio real + transporte |
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
