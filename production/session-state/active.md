# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador vive ya en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — Fase 0 terminada y verificada.
**Last update:** 2026-08-19

## Current task
Ninguna en curso. La Fase 0 cerró; la Fase 1 (el MVP) no ha empezado.

## Lo construido hoy
- `web/` — Next.js 16.3.1 + React 19.2.8 + Tailwind 4 + Geist.
- `web/src/app/globals.css` — tokens del spinoff oscuro, contrastes medidos.
- `web/src/lib/comfy.ts` — saneador de cabeceras como función pura.
- `web/src/app/api/comfy/[...path]/route.ts` — el proxy del ADR-001.
- `web/tests/comfy.test.ts` — 7 tests, 2 contra el motor real. `npm test`.

## Decisiones tomadas
- Identidad, motor, audiencia y alcance (ver `PRODUCT.md`).
- ADR-001: puente a ComfyUI vía proxy propio del lado servidor.
- ADR-002: Next.js + TypeScript + Tailwind + shadcn/ui.
- Dirección visual: spinoff oscuro de CRTIC clean, escenario + bandeja
  (asignada por `concept-seed`, semilla `5006a149`, confirmada por el usuario
  tras ver tres bocetos generados con Qwen-Image).
- El código vive en `web/`; la raíz es del andamiaje del estudio.

## Próximos pasos
- **Fase 1 (MVP):** escenario + bandeja · progreso real por websocket de
  ComfyUI · reproducción con onda · descarga · historial persistente.
- Al construir: superficies mates, grilla del campo al 8%, bandeja subordinada
  al escenario, fila activa con filo lateral y no recuadro.
- `DESIGN.md` se escribe al terminar la Fase 1, desde el mundo construido.
- `.gitattributes` para fijar finales de línea.
