# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones cerradas aún
Sesión 1 en curso. El bloque de cierre definitivo lo escribe `/close`; el
borrador vive ya en `directives/session-log.md`.
<!-- /cierre -->

---

**Status:** sesión 1 — identidad definida, esperando decisión sobre B-001.
**Last update:** 2026-08-19

## Current task
**Definir qué es TTS Studio** — hecha. `project-overview.md`, `roadmap.md`
(borrador) y `backlog.md` escritos con contenido real.

## Decisiones tomadas en esta sesión
- App con interfaz (no pipeline, no laboratorio, no servicio con API).
- Motor Qwen3-TTS 1.7B local sobre ComfyUI. Sin APIs cloud.
- Un solo usuario: sin autenticación, sin multiusuario, sin despliegue.
- Poda de `comfy-mcp/` aprobada en concepto pero **denegada en ejecución** — no
  se tocó ningún archivo.

## Bloqueos / esperando al usuario
1. **B-001** — autorizar el rescate del audio de Andrés (61 MB, no regenerable)
   y del benchmark (9,4 MB) desde `comfy-mcp/.tmp/`.
2. Aprobar las cinco fases del roadmap para mover el sentinel a `done`.

## Contexto heredado (no producido en esta sesión)
`comfy-mcp/` es una investigación cerrada el 2026-08-18 en otro hub. Dejó
instalado: ComfyUI + comfy-cli + servidor MCP `comfy` (scope usuario,
conectado), Qwen-Image 2512 para imagen y **Qwen3-TTS 1.7B con clonación
zero-shot validada**, más un benchmark de 16 segmentos real-vs-clonado.

## Próximos pasos
- Resolver B-001 con autorización explícita.
- ADR del puente app ↔ ComfyUI (B-002) con `technical-director`.
- Decidir el stack de la aplicación.
- Primer commit del scaffold.
