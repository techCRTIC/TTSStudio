# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador, ya completo, vive en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — Fase 0 terminada y verificada. Árbol limpio.
**Last update:** 2026-08-19

## Current task
Ninguna en curso. La Fase 0 cerró. La Fase 1 (el MVP) está esperando el visto
bueno del usuario para arrancar — se le preguntó y no ha respondido todavía.

## Estado del repositorio
Rama `main`, árbol limpio, seis commits:

| | |
|---|---|
| `2254494` | docs: PRODUCT.md apunta al kit de diseño en el repo |
| `4f28d5d` | chore: `.gitattributes`, finales de línea normalizados |
| `9f1b068` | feat(web): app en pie + puente a ComfyUI (Fase 0) |
| `d377600` | chore: kit del sistema CRTIC (V1 + V2) |
| `bf23970` | docs: identidad, alcance y roadmap |
| `12d5481` | chore: andamiaje del proyecto |

## Lo construido
- `web/` — Next.js 16.3.1 + React 19.2.8 + Tailwind 4 + Geist.
- `web/src/app/globals.css` — tokens del spinoff oscuro, contrastes medidos.
- `web/src/lib/comfy.ts` — saneador de cabeceras como función pura.
- `web/src/app/api/comfy/[...path]/route.ts` — el proxy que exige el ADR-001.
- `web/tests/comfy.test.ts` — 7 tests, 2 contra el motor real. `npm test`.
- `CRTIC-design-system/` — el kit de la casa, puesto por el usuario a mitad de
  sesión. V2 es el contrato vigente y es idéntico al que se usó para derivar
  los tokens; V1 es la revisión de junio.

## Decisiones tomadas
- Identidad, motor, audiencia y alcance → `PRODUCT.md`.
- **ADR-001:** puente a ComfyUI vía proxy propio del lado servidor. ComfyUI
  responde 403 a cualquier `Origin` ajeno; se midió aislando la variable.
- **ADR-002:** Next.js + TypeScript + Tailwind + shadcn/ui.
- Dirección visual: spinoff oscuro de CRTIC clean, estructura **escenario +
  bandeja** (asignada por `concept-seed`, semilla `5006a149`, confirmada por el
  usuario tras ver tres bocetos generados con Qwen-Image).
- El código vive en `web/`; la raíz es del andamiaje del estudio.
- En oscuro el botón primario lleva tinta grafito, no blanca: blanco sobre el
  naranja mide 3,54 y no pasa AA.

## Próximos pasos
1. **Fase 1, el MVP** — escenario + bandeja · progreso real por websocket de
   ComfyUI · reproducción con onda · descarga · historial persistente.
2. Al construir, corregir lo que el modelo de imagen hizo mal en los bocetos:
   superficies mates y no vidriosas · grilla del campo al 8% · bandeja
   subordinada al escenario · fila activa con filo lateral, no recuadro.
3. `DESIGN.md` se escribe **al terminar** la Fase 1, desde el mundo construido,
   como manda el flujo de `impeccable`.

## Riesgos vivos
- Los bocetos quedaron en `.tmp/sketches/`, gitignorado y territorio de purga.
- El audio de Andrés sigue en `comfy-mcp/.tmp/audio/` (61 MB, no regenerable,
  materia prima de la Fase 4). El usuario descartó rescatarlo — backlog B-001,
  cerrado con el riesgo asumido y por escrito.
