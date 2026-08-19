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

## B-005 — Convertirlo en app de escritorio
**Status:** idea
Pedido por el usuario el 2026-08-19: "lo que cambiaría luego es que fuera una
app de escritorio quizás". El ADR-002 ya dejó el camino abierto y explicó por
qué no se hizo ahora: Tauri daría un `.exe` real y haría desaparecer solo el 403
del `Origin` (las peticiones saldrían del lado nativo), pero el toolchain de
Rust y las compilaciones lentas gravan cada iteración, y un MVP gasta
iteraciones. Un envoltorio Tauri sobre el build de Next sigue disponible; lo
inverso no.

## B-006 — Fase previa de instalación con portal de ingreso
**Status:** idea
Pedido por el usuario el 2026-08-19. Hoy la app asume que ComfyUI ya corre, que
el pack `comfyui-qwen3-tts` está instalado y que hay al menos una voz calculada
en disco; si algo falta, lo único que ocurre es que la barra superior avisa que
el motor no responde. La idea es una fase previa que verifique dependencias,
guíe la instalación de lo que falte y sirva de puerta de entrada. Se solapa con
B-003 (arranque y salud de ComfyUI desde la app), que probablemente quede
absorbido por esto.

## B-007 — Cerrar formalmente el trabajo de diseño
**Status:** idea
El flujo de `impeccable` exige dos cosas al terminar un mundo visual, y ninguna
se hizo en la sesión 1 porque no había navegador en la sesión:
1. **La revisión de acabado** con capturas de escritorio y móvil, que es lo
   único que juzga el render contra el contrato de dirección.
2. **`DESIGN.md` del spinoff oscuro**, escrito *desde el mundo construido* y no
   antes — un reglamento escrito por adelantado se defiende de la realidad en
   vez de describirla.
Relacionado: el comportamiento en ventanas angostas tampoco está verificado.
Las dos excepciones de animación de maquetación (`transition: height` en
`ScriptField`, `transition: width` en `StatusLine`) deben quedar registradas ahí
como decisiones, no como deuda.


## Cerradas

## ❌ B-001 — [CERRADO] Ordenar la herencia `comfy-mcp/`
**Status:** ❌ sin objeto
Se proponía rescatar de `comfy-mcp/.tmp/` los 61 MB de audio de Andrés (material
no regenerable, materia prima de la Fase 3) y los 9,4 MB del benchmark zero-shot,
antes de que una purga de `.tmp/` los borrara. **El usuario lo descartó
explícitamente el 2026-08-19** ("lo primero no importa"). Queda registrado el
riesgo asumido: ese material vive en un directorio cuya convención en este
estudio es que se purga sin preguntar, incluido el paso final de `/close`.

## ✅ B-002 — [CERRADO] Decidir el puente entre la app y ComfyUI
**Status:** ✅ hecho
Resuelto por [[ADR-001-comfyui-bridge]] el 2026-08-19. La app habla con la API
HTTP de ComfyUI, y siempre desde un componente propio del lado servidor: se
midió que ComfyUI responde **403 a cualquier petición con `Origin` ajeno**, así
que un frontend estático puro no es implementable. El servidor MCP `comfy` queda
fuera del runtime de la app.

