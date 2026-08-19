# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador, ya completo, vive en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — Fase 0 cerrada, Fase 1 construida pero **sin juzgar**.
**Last update:** 2026-08-19

## Current task
La pantalla de generación está escrita, compilada y servida. Falta lo único que
no puedo hacer yo: **abrirla, mirarla y generar una vez de verdad.**

## ⚠️ Lo que NO está verificado
Dos huecos reales, y conviene no confundirlos con trabajo terminado:

1. **Nadie ha visto la pantalla renderizada.** No había navegador en la sesión.
   Verifiqué por HTTP que los elementos están en el markup, pero el juicio
   visual — si el campo animado está muy presente, si la tarjeta respira, si el
   naranja pesa lo justo — está pendiente. El flujo de `impeccable` exige una
   revisión de acabado con capturas antes de dar esto por terminado.
2. **No se ha disparado ninguna generación real.** El permiso para el POST fue
   denegado dos veces y no insistí: gasta GPU y escribe archivos. El envío, la
   lectura de estado y la recuperación del audio están escritos y tipados, pero
   la cadena completa no tiene una sola ejecución que la respalde.

## Cómo levantarlo
```
cd web && npm run start     # http://localhost:3000
cd web && npm test          # 7 tests, 2 contra el motor real
```
ComfyUI tiene que estar corriendo en `127.0.0.1:8188`. Si no lo está, la app lo
dice en la barra superior en vez de fallar en silencio.

## Estado del repositorio
Rama `main`, árbol limpio, ocho commits. El último: `68f90d7 feat(web): the
generation screen — stage and tray (Phase 1)`.

## Lo construido
| Archivo | Qué es |
|---|---|
| `web/src/app/page.tsx` | La pantalla: escenario central + bandeja lateral |
| `web/src/components/AudioField.tsx` | El campo de audio animado (capas = suma de senoides) |
| `web/src/components/Waveform.tsx` | Onda decodificada del audio real + transporte |
| `web/src/lib/history.ts` | Historial en localStorage vía store externo |
| `web/src/lib/tts.ts` | Construcción del grafo Qwen3, envío y lectura de estado |
| `web/src/lib/comfy.ts` | El saneador de cabeceras del ADR-001 |
| `web/src/app/api/…` | `voices`, `generate`, `status/[promptId]`, `comfy/[...path]` |

## Decisiones tomadas
- Identidad, motor, audiencia y alcance → `PRODUCT.md`.
- **ADR-001:** puente a ComfyUI vía proxy propio del lado servidor (403 al
  `Origin` ajeno, medido aislando la variable).
- **ADR-002:** Next.js + TypeScript + Tailwind + shadcn/ui.
- Dirección visual: spinoff oscuro de CRTIC clean, **escenario + bandeja**
  (`concept-seed`, semilla `5006a149`, confirmada tras ver tres bocetos).
- En oscuro el botón primario lleva tinta grafito: blanco sobre el naranja mide
  3,54 y no pasa AA.
- El historial vive en localStorage: app de un solo usuario, una base de datos
  sería ceremonia.
- La biblioteca de voces se lee del combo de ComfyUI, no de una tabla propia,
  para que no pueda desincronizarse del disco.

## Próximos pasos
1. Abrir `localhost:3000`, generar una vez, y juzgar lo que se ve.
2. Revisión de acabado con capturas (la exige `impeccable` antes de cerrar).
3. Progreso paso a paso por websocket — hoy el estado es real pero grueso.
4. `DESIGN.md` del spinoff, escrito desde el mundo ya construido.

## Riesgos vivos
- Los bocetos siguen en `.tmp/sketches/`, gitignorado y territorio de purga.
- El audio de Andrés sigue en `comfy-mcp/.tmp/audio/` (61 MB, no regenerable,
  materia prima de la Fase 4). Descartado por el usuario — B-001, cerrado con
  el riesgo asumido y por escrito.
- Un `npm run start` deja un proceso Node que sobrevive a `TaskStop`. Si el
  puerto 3000 da `EADDRINUSE`, hay que matarlo por PID.
