# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué
> pidió el usuario, acciones, decisiones (con alternativas descartadas),
> resultados y próximos pasos.

## 2026-08-19 — Scaffold e identidad del proyecto

<!-- cierre -->
## 🧾 Cierre — Sesión 1 · 2026-08-19

**En una frase:** TTS Studio pasó de ser una carpeta vacía con una investigación ajena adentro a un proyecto con identidad, alcance y roadmap escritos.

**Qué se hizo**
- `/start` levantó el andamiaje completo, que no existía: las instrucciones para agentes, el repositorio git, las cuatro living docs, el estado de sesión y la memoria del proyecto.
- Se revisó la carpeta heredada `comfy-mcp/` y se extrajo lo que importa: el stack de voz ya está instalado y funcionando en esta máquina, con clonación zero-shot validada sobre audio real y un benchmark de 16 segmentos que sirve de línea base.
- Se escribieron `project-overview.md` (identidad real, ya no `_TBD_`), `roadmap.md` (cinco fases, en borrador) y `backlog.md` (cuatro ítems sembrados).

**Qué se decidió y por qué**
- **TTS Studio es una app con interfaz**, no un pipeline de scripts ni un laboratorio de fine-tuning: el objetivo es usarla a diario, no automatizarla. Se descartaron esas dos opciones y también la de un servicio local con API.
- **El motor es Qwen3-TTS local sobre ComfyUI**, porque ya está instalado y validado con material real, no cuesta por uso y la voz nunca sale de la máquina. Se descartaron las APIs de pago, el híbrido local+cloud y la fase previa de evaluar otras opciones open source.
- **Un solo usuario, sin autenticación ni despliegue**: es una herramienta personal, y eso saca del alcance una cantidad enorme de trabajo.
- **La poda de la carpeta heredada quedó sin hacer**: el usuario denegó la operación de mover y borrar archivos. Los 61 MB de audio de Andrés siguen dentro de un `.tmp/`, que es exactamente donde no deberían estar.

**Estado al cerrar:** rama `master` · sin commits todavía · sin tests · las fases del roadmap son un borrador sin aprobar.
**Siguiente paso concreto:** resolver B-001 — sacar el audio de Andrés y el benchmark de `comfy-mcp/.tmp/` a un lugar estable del proyecto, con la autorización explícita del usuario.
<!-- /cierre -->

**Time:** (inicio de sesión)
**User request:** `/start`, y luego la definición de identidad del proyecto.

### Actions taken
- **Paso 0 del scaffold** (nada de esto existía): trío `CLAUDE.md` / `AGENTS.md` / `GEMINI.md` desde la plantilla del harness · `git init` + `.gitignore` · `directives/` con las cuatro living docs · `production/session-state/active.md` con su bloque de cierre · `memory/MEMORY.md` · `execution/` · `.tmp/`.
- **Verificación de dependencias de skills** contra `global-skills-map.md`, leyendo `~/.claude/skills/` directamente (no solo el listado de la sesión, que oculta las `disable-model-invocation`): 83 carpetas, las 7 REQUIRED y las 22 RECOMMENDED presentes, sin drift respecto de la reconciliación del 2026-08-12.
- **Lectura acotada de la herencia**: `comfy-mcp/directives/` (overview + títulos del backlog) y la cabecera del repo-scan. No se leyó la bitácora completa de esa investigación (372 líneas).
- **Poda de `comfy-mcp/.tmp/`**: intentada, **denegada por el usuario**. No se movió ni se borró ningún archivo.
- Escritura de `project-overview.md`, `roadmap.md` y `backlog.md` con contenido real.

### Decisions
- Identidad, motor, audiencia y alcance: ver el bloque de cierre. Las alternativas descartadas quedaron registradas en la tabla de decisiones de `project-overview.md`.
- **Se omitió el fan-out a `producer` y `doc-keeper`** que el paso 3 de `/start` prescribe: sobre un proyecto recién scaffoldeado habrían sintetizado tres archivos creados un minuto antes. Regla 5 del mindset del orquestador — delegar preguntas, no pulsaciones.
- El roadmap se escribió como **borrador explícito**: el patrón 8 (Roadmap Checkpoint) pide proponerlo al usuario, y el sentinel sigue en `pending` a la espera de su visto bueno.

### Outcomes
- Proyecto operable bajo las reglas del Personal AI Dev Studio, con identidad escrita y cuatro ítems de backlog sembrados.
- Sin código todavía, y a propósito: la Fase 0 del roadmap está bloqueada por B-002 (cómo habla la app con ComfyUI), que necesita un ADR.

### Next steps / open questions
- **B-001, y es el urgente:** los 61 MB de audio de Andrés y los 9,4 MB del benchmark viven en `comfy-mcp/.tmp/`, una carpeta cuya convención es "esto se borra". Es material no regenerable y es la materia prima de la Fase 3.
- Aprobar o corregir las cinco fases del roadmap, y luego mover el sentinel a `done`.
- **B-002:** decidir el puente app ↔ ComfyUI (API HTTP directa, previsiblemente) con `technical-director` y dejar el ADR.
- Decidir el stack de la aplicación. No hay ninguna señal todavía sobre qué forma debe tener la interfaz.
- Primer commit del scaffold, y renombrar `master` → `main` si ese es el estándar.
