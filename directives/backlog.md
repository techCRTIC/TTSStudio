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

**Ampliado en la sesión 2 (2026-08-21):** ahora hay una dependencia más, y es
la más pesada de todas. El alta de voces necesita el modelo de transcripción
(`faster-whisper large-v3`), que son **2,9 GB que se descargan la primera vez**.
Medido: la primera ejecución tardó **610 segundos, casi todo descarga**, y
mientras tanto la interfaz no tendría nada que mostrar. Una fase de instalación
que descargue esto por adelantado —con progreso visible— es lo que evita que el
primer usuario piense que la app se colgó. Ver [[ADR-003]].

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

## B-008 — El guardián de secretos bloquea código JavaScript legítimo
**Status:** idea
Detectado el 2026-08-21. El hook `validate-commit.sh` impide que un comando lea
archivos de secretos, y hace bien. Pero busca la subcadena de la extensión de un
archivo de clave **en cualquier parte del comando**, y en JavaScript la propiedad
que dice qué tecla se pulsó contiene esa misma subcadena literalmente.
Resultado: bloqueó dos comandos que solo escribían código y documentación, sin
ningún secreto de por medio.

Costó dos rodeos en la sesión 2. El arreglo natural es exigir que la coincidencia
sea un **nombre de archivo** —precedida de separador, espacio o comilla, y no
pegada a un identificador— en vez de una subcadena suelta.

**No se tocó el hook**: `.claude/hooks/` es territorio privilegiado y CLAUDE.md
exige un permiso fresco y explícito del usuario para modificarlo. Queda aquí
para que él decida.

## B-009 — ¿Una semilla transfiere carácter entre textos distintos?
**Status:** idea
Abierto en la sesión 2 al construir las semillas guardables. Está medido que la
misma semilla con el **mismo** texto reproduce la misma toma. Lo que **no** está
medido es si la misma semilla con textos **distintos** conserva algo reconocible
—un tono, una energía, una manera de respirar—. La respuesta cambia cuánto valen
las semillas guardadas: si transfiere, guardar «la seria» es oro; si no, sirven
solo para repetir una frase concreta.

La interfaz hoy **no afirma** ninguna de las dos cosas, a propósito (está escrito
así en `lib/favorites.ts`). Solo se puede responder escuchando: generar dos
textos distintos con la misma semilla y compararlos contra los mismos textos con
semillas diferentes. Ver [[ADR-003]] para el precedente de medir antes de
afirmar.


## B-010 — «veintiún» apocopado en el normalizador de texto
**Status:** idea
Detectado el 2026-08-24 al traer `tts_normalizar_texto.py` desde la skill
`voz-local`. Con la entrada «un 21% más» devuelve «un veintiuno por ciento
más», cuando el español pide «un veintiún por ciento». El script YA tiene la
lógica de apócope (`_apocopar`, `NO_APOCOPAR_ANTES_DE`) pero no dispara en este
caso.

No se tocó a propósito: el original vive en la skill y arreglarlo solo aquí
separaría las dos copias. El arreglo correcto es en la skill y luego re-importar.
Ver [[ADR-006-local-language-model-for-text]].

## B-011 — Usar las tomas marcadas como ejemplos de la reescritura
**Status:** idea
Abierto el 2026-08-24. Ya se puede marcar una toma como buena, y la reescritura
ya funciona con ejemplos fijos (los medidos de la skill). Lo que falta es unir
las dos cosas: usar los textos de las tomas que al usuario le gustaron como
ejemplos adicionales, para que la propuesta se parezca a lo que a él le funciona
y no solo a lo que funciona en general.

Requiere pensar cuántos ejemplos caben sin encarecer la llamada, y qué pasa
cuando las tomas marcadas se contradicen entre sí. **No hacerlo sin medir si
mejora**: hoy la reescritura ya es buena, y más contexto no es gratis.

## B-012 — La app no instala ollama ni el modelo de texto
**Status:** idea
Abierto el 2026-08-24 con [[ADR-006-local-language-model-for-text]]. El botón de
mejora y el texto fantasma necesitan ollama corriendo y `qwen3:4b` (2,5 GB)
descargado. La app degrada con honestidad —la parte determinista responde igual
y el panel dice que la reescritura no está disponible—, pero no instala nada ni
guía la instalación. Encaja dentro de B-006, que ya acumula el modelo de
transcripción de 2,9 GB.

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

## ✅ B-004 — [CERRADO] Controles de la interfaz acotados por el modelo
**Status:** ✅ hecho
Resuelto por [[ADR-006-local-language-model-for-text]] el 2026-08-24. La
pregunta era si la puntuación —la única palanca real, porque `instruct` no
existe en voz clonada— se convertía en ayuda visible. Sí: el botón «Escribirlo
para la voz» revisa el texto con las reglas medidas en la investigación
`comfy-mcp` (ortografía +15 a +29 %, puntuación 3,5× más que un fine-tune),
normaliza números y fechas, y propone una reescritura. La app sigue sin
prometer controles que el motor no da.
