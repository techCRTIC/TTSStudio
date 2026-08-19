# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué pidió el usuario,
> acciones, decisiones (con alternativas descartadas), resultados y próximos
> pasos.

## 2026-08-19 — De carpeta vacía a Fase 0 terminada

<!-- cierre -->
## 🧾 Cierre — Sesión 1 · 2026-08-19

**En una frase:** TTS Studio nació entero en una sesión — identidad, arquitectura, dirección visual y la Fase 0 construida y verificada contra el ComfyUI real.

**Qué se hizo**
- Se levantó el andamiaje del proyecto, que no existía, y se inició el repositorio.
- Se definió qué es TTS Studio: una app con interfaz para generar voz clonada, de un solo usuario, con el motor Qwen3-TTS corriendo local sobre ComfyUI.
- Se midió un límite de ComfyUI que decidió la arquitectura: rechaza con 403 cualquier petición que venga de otro origen. Eso obliga a que la app tenga un componente de servidor propio.
- Se eligió el stack (Next.js con Tailwind y shadcn) y se cerró la dirección visual: un spinoff oscuro del sistema CRTIC clean, con una pantalla de escenario central y una bandeja lateral para el guión y el historial.
- Se generaron tres bocetos con Qwen-Image en el ComfyUI de la casa para ver la dirección antes de construirla.
- Se construyó la Fase 0: proyecto Next en pie, capa de tokens oscuros, y el proxy hacia ComfyUI con siete tests en verde, dos de ellos contra el motor real.
- El usuario dejó el kit real del sistema CRTIC dentro del proyecto a mitad de sesión. Se verificó que su versión vigente es idéntica a la que ya se había usado para derivar los tokens, así que no hubo nada que rehacer.

**Qué se decidió y por qué**
- **App con interfaz**, no un pipeline de scripts ni un laboratorio de fine-tuning: el objetivo es usarla a diario, no automatizarla.
- **Motor local Qwen3-TTS**, porque ya estaba instalado y validado con audio real, no cuesta por uso y la voz nunca sale de la máquina. Se descartaron las APIs de pago y el híbrido.
- **Next.js sobre Tauri**, aunque Tauri daría una app de escritorio de verdad: el toolchain de Rust y las compilaciones lentas gravan cada iteración, y un MVP gasta iteraciones. Tauri sigue disponible como envoltorio más adelante.
- **El servidor MCP `comfy` queda fuera del runtime de la app.** Es un protocolo para agentes; meterlo dentro de la app arrastraría comfy-cli, un venv de Python y prompts de consentimiento en medio de la interfaz.
- **El botón primario invierte su tinta respecto del sistema padre.** Se midió que blanco sobre el naranja da 3,54 y no pasa el estándar de contraste; grafito sobre naranja da 5,15.
- **Se descartó `AetherFlow` como fondo animado** en favor de `PlotFieldBg`: el primero es morado sobre negro puro, que viola dos prohibiciones del sistema, y no respeta movimiento reducido.

**Un error propio, corregido en la sesión:** el primer `git add -A` metió los 74 archivos del kit de diseño dentro del commit de la Fase 0, bajo un mensaje que hablaba de otra cosa. Se separaron en dos commits antes de seguir; estaba sin push, así que fue limpio.

**Estado al cerrar:** rama `main` · árbol limpio · seis commits · 7 tests en verde · build de producción correcto · Fase 0 terminada, Fase 1 sin empezar.
**Siguiente paso concreto:** construir la pantalla de generación (Fase 1): escenario central con el texto y su onda, bandeja lateral, y progreso real leído del websocket de ComfyUI.
<!-- /cierre -->

**Time:** sesión larga, un solo tramo.
**User request:** `/start` → definir el proyecto → primer commit → decidir stack, roadmap y dirección visual → construir.

### Actions taken
- **Andamiaje (paso 0 de `/start`):** trío `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`, `git init` + `.gitignore`, las cuatro living docs, `production/session-state/`, `memory/`, `execution/`, `.tmp/`.
- **Verificación de skills** contra `global-skills-map.md` leyendo `~/.claude/skills/` directamente: 83 carpetas, las 7 obligatorias y las 22 recomendadas presentes, sin drift.
- **Evidencia sobre ComfyUI**, no supuestos: `server_info` (corriendo, 0.33.0, pack qwen3-tts 1.7.0, RTX 5090 con 23,9 GB) y una batería de `curl` que aisló la cabecera `Origin` como única variable del 403.
- **Búsqueda del sistema de diseño** que el usuario mencionó: encontrado como **CRTIC clean** (contrato en `DESIGN.md` + kit ejecutable, replicado en doce proyectos; la copia canónica es la del 2026-07-06). Encontrada también su biblioteca de componentes animados repartida en cuatro carpetas `Componentes/`.
- **Flujo de `impeccable`:** `context.mjs` → `init` (entrevista de tres preguntas + `PRODUCT.md`) → `new-work`, que clasificó el trabajo como superficie nueva dentro de un mundo establecido, no como mundo nuevo. Siete estructuras derivadas y `concept-seed.mjs --scope surface --mode operate` asignó la número 5 (semilla `5006a149`).
- **Tres bocetos generados** con `t2i_qwen_lightning` en el ComfyUI local, revisados y presentados al usuario, que confirmó la dirección asignada.
- **Fase 0 construida:** `create-next-app` en `web/` (Next 16.3.1, React 19.2.8, Tailwind 4, Geist ya cableado), capa de tokens oscuros en `globals.css`, `src/lib/comfy.ts` con el saneador de cabeceras como función pura, y el proxy en `src/app/api/comfy/[...path]/route.ts`.
- **Contrastes calculados**, no estimados, para los cinco colores del sistema oscuro sobre los tres niveles de superficie.

### Decisions
Ver el bloque de cierre y los dos ADRs. Además:
- **El código vive en `web/`**, no en la raíz: la raíz ya está ocupada por el andamiaje del estudio y `create-next-app` habría chocado con `CLAUDE.md` y `directives/`.
- **Se omitió el fan-out a `producer` y `doc-keeper`** del paso 3 de `/start`: sobre un proyecto recién scaffoldeado habrían sintetizado archivos creados un minuto antes.
- **B-001 (rescatar el audio de `comfy-mcp/.tmp/`) se cerró como descartado por el usuario**, dejando registrado el riesgo asumido.

### Outcomes
- `PRODUCT.md`, `ADR-001` (puente a ComfyUI), `ADR-002` (stack), roadmap con seis fases y el MVP delimitado, backlog con dos abiertas y dos cerradas.
- Fase 0 terminada y verificada: 7 tests en verde (2 contra el motor real), build de producción correcto, y una petición con `Origin` de navegador atravesando el proxy y devolviendo 200 con datos reales de ComfyUI.

### Next steps / open questions
- **Fase 1**, el MVP: escenario + bandeja, progreso real por websocket, reproducción con onda, descarga, historial persistente.
- Al construir la interfaz, corregir lo que el modelo de imagen hizo mal en los bocetos: superficies mates y no vidriosas, grilla del campo al 8%, bandeja subordinada al escenario, y fila activa marcada con filo lateral y no con recuadro naranja completo.
- `DESIGN.md` se escribe al terminar la Fase 1, desde el mundo construido, como manda el flujo de `impeccable`.
- ✅ Resuelto en la sesión: `.gitattributes` añadido, se acabaron los avisos de LF/CRLF.
- Los bocetos quedaron en `.tmp/sketches/`, que está gitignorado y es territorio de purga.
