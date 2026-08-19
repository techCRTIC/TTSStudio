# Active Session State

<!-- cierre -->
## 🧾 Cierre — Sesión 1 cerrada · 2026-08-19
El resumen completo de la sesión vive en `directives/session-log.md`, y es lo
que la próxima sesión lee primero. Este archivo es el detalle recuperable.
<!-- /cierre -->

---

**Status:** sesión 1 cerrada. MVP terminado y en uso.
**Last update:** 2026-08-19 (by /close)

## Current task
Ninguna en vuelo. La sesión cerró limpia.

## Siguiente paso concreto
Empezar la **Fase 2 — biblioteca de voces**: añadir una ruta en
`web/src/app/api/voices/` que acepte un audio de referencia, lo escriba en la
carpeta `input` de ComfyUI y calcule el prompt de voz con el nodo
`Qwen3PromptMaker` (verificado: está instalado en el motor). Hoy solo existe
*Andres Bobe* porque ya estaba calculada en disco.

Sus continuaciones inmediatas: la pantalla de alta de voz, y después la
procedencia visible de cada voz — son de personas identificables.

## Cómo levantarlo
```
npm start        # desde la RAÍZ. Un solo comando.
```
Comprueba y levanta ComfyUI si hace falta, libera el puerto, compila, arranca y
abre el navegador. Detalle y modos de fallo → `README.md`.

⚠️ **El servidor lo levanta el usuario, en su terminal.** Un `npm start` lanzado
como tarea de fondo de un agente muere al terminar el turno. Ver
[[agent-background-server-dies-with-turn]].

## Dónde están las cosas
| Ruta | Qué es |
|---|---|
| `web/src/app/page.tsx` | El escenario: plegado → desplegado, con la bandeja |
| `web/src/components/ScriptField.tsx` | Área de escritura que crece + desvanecidos |
| `web/src/components/AudioField.tsx` | Campo de audio animado de fondo |
| `web/src/components/Waveform.tsx` | Onda decodificada del audio real + transporte |
| `web/src/components/VoiceSelect.tsx` | Selector de voz propio (listbox accesible) |
| `web/src/components/StatusLine.tsx` | Estado del motor, con ancho que transforma |
| `web/src/lib/comfy.ts` | El saneador de cabeceras del ADR-001 |
| `web/src/lib/tts.ts` | Grafo Qwen3, envío y lectura de estado |
| `web/src/lib/history.ts` | Historial en localStorage vía store externo |
| `scripts/start.mjs` | El lanzador de `npm start` |
| `directives/architecture/` | ADR-001 (puente) y ADR-002 (stack) |

## Decisiones clave
- Identidad, alcance y restricciones → `PRODUCT.md`.
- **ADR-001:** la app habla con ComfyUI **siempre desde el servidor**. Se midió
  que responde 403 a cualquier `Origin` ajeno, aislando la variable.
- **ADR-002:** Next.js + TypeScript + Tailwind + shadcn/ui.
- Dirección visual: spinoff oscuro de CRTIC clean, estructura **escenario +
  bandeja** (`concept-seed`, semilla `5006a149`).
- Botón primario con tinta grafito sobre naranja: el blanco mide 3,54 y no pasa.
- Historial en localStorage; la biblioteca de voces se lee del propio ComfyUI.

## Reglas aprendidas que no se deben deshacer
- **Dos excepciones decididas de animación de maquetación** (`transition: height`
  en `ScriptField`, `transition: width` en `StatusLine`), razonadas en su propio
  archivo. No "arreglarlas" sin leer eso.
- **Para alturas automáticas, `grid-template-rows`** antes que animar `height`.
- **No se inventan medidores de progreso**: mientras el motor genera no hay nada
  medible, así que se dice la posición en cola y ya.
- Ver `memory/` para los cuatro gotchas que costaron tiempo esta sesión.

## Abierto / sin verificar
- **Ventanas angostas:** nadie lo ha abierto estrecho. Sin anchos fijos en el
  código, pero sin probar.
- **B-007:** la revisión de acabado con capturas y el `DESIGN.md` del spinoff
  nunca se hicieron — no había navegador en la sesión.
- Los tres bocetos de dirección siguen en `.tmp/sketches/`, que es territorio de
  purga. Si valen como registro, hay que moverlos.
- El audio de Andrés sigue en `comfy-mcp/.tmp/audio/` (61 MB, no regenerable).
  Descartado por el usuario — B-001, riesgo asumido por escrito.
