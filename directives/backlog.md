# Backlog — TTS Studio

> Cola de ideas futuras y todos diferidos. NO es la tarea activa (→
> `production/session-state/active.md`), ni la cronología (→ `session-log.md`),
> ni el estado actual (→ `project-overview.md`). `producer` marca prioridades;
> `doc-keeper` mantiene el archivo.
>
> Formato de entrada: `## B-NNN — título` + una línea **Status:** `idea` /
> `en curso` / `✅ hecho`.

**Cómo leer este archivo.** Dos secciones, y solo dos:

- **`## Abiertas`** — todo lo NO hecho, ordenado por número de menor a mayor. Esto es la cola.
- **`## Cerradas`** — todo lo hecho o descartado, ordenado por número. Se conservan por sus
  `[[links]]` y por el razonamiento que documentan. **No son pendientes. No reabrir sin evidencia
  nueva.** Sus títulos van marcados `## ✅ B-NNN — [CERRADO]` para que se distingan de un vistazo.

**Los números nunca se reordenan ni se reasignan**: son identidad, y hay `[[links]]` cruzados que
apuntan a ellos. Un ítem que se cierra **se mueve de sección, no cambia de número**.

Al cerrar un ítem: cambia su `**Status:**` a `✅ hecho` (o `❌ sin objeto`), marca el título como
`## ✅ B-NNN — [CERRADO] título`, y **muévelo a `## Cerradas`** conservando su número.

## Abiertas

## B-001 — Ordenar la herencia `comfy-mcp/`
**Status:** idea
Pendiente desde la sesión 1: la operación de poda quedó **denegada** por el
usuario, así que la carpeta sigue intacta con sus ~105 MB. Lo que hay que
resolver, en orden de importancia:
1. **Los 61 MB de audio de Andrés** (`comfy-mcp/.tmp/audio/`) son material NO
   regenerable y son la materia prima de la Fase 3 (fine-tune). Vivir en un
   `.tmp/` — una carpeta cuya convención es "esto se borra" — es un riesgo real
   de pérdida. Deberían moverse a un lugar estable del proyecto.
2. El benchmark zero-shot de 16 segmentos (`comfy-mcp/.tmp/tts/`, 9,4 MB) es la
   línea base contra la que se mide la Fase 3. Mismo problema.
3. El clon shallow del repo (3,4 MB) es regenerable con un `git clone`.
4. Los 31 MB de `imagenes/` pertenecen a la línea de imagen, ajena a este
   proyecto.

## B-002 — Decidir el puente entre la app y ComfyUI
**Status:** idea
El servidor MCP `comfy` es excelente para que un agente maneje ComfyUI, pero
una aplicación no debería depender de un servidor MCP en runtime. Lo natural es
hablar con la API HTTP de ComfyUI directamente. Requiere ADR y sign-off de
`technical-director`. Bloquea la Fase 0 del roadmap.

## B-003 — Arranque y salud de ComfyUI desde la app
**Status:** idea
La app necesita que ComfyUI esté corriendo. Decidir si lo arranca ella
(`comfy launch --background`, con el gotcha del PATH del venv documentado), si
asume que ya corre, o si detecta y guía al usuario. Afecta directamente el
manejo de errores de la Fase 1.

## B-004 — Controles de la interfaz acotados por el modelo
**Status:** idea
Qwen3-TTS en modo Voice Clone **no** expone velocidad ni emoción como
parámetros (solo `CustomVoice` los tiene). La interfaz no puede prometer
controles que el motor no da. Lo que sí influye es la puntuación del texto —
evaluar si eso se convierte en una ayuda visible al usuario.

## Cerradas

_(sin entradas todavía)_
