# El CLI y el servidor MCP de ComfyUI — lo que costó averiguar

Todo lo de aquí salió de la investigación `comfy-mcp` (2026-08-18/19) y del uso
posterior en TTS Studio. Es conocimiento **medido o leído en el código fuente**,
no recordado. Lo que no está verificado, lo dice.

---

## 1. Qué es cada pieza, y por qué importa la distinción

| Pieza | Qué es | Dónde vive |
|---|---|---|
| **ComfyUI** | el motor. Un servidor HTTP en `127.0.0.1:8188` con una cola de trabajos | el *workspace* (`~/comfy` por convención de comfy-cli) |
| **comfy-cli** | el cliente oficial. Instala, lanza, corre grafos, descarga modelos | un venv propio |
| **comfy-mcp** | el servidor MCP. Le da esas capacidades a un agente | el mismo venv |

**`comfy-mcp` es deliberadamente un envoltorio delgado sobre `comfy-cli`.** Cada
una de sus ~39 tools ejecuta `comfy --json --where local <args>` como
subproceso, parsea el resultado versionado `envelope/1` y devuelve su `data`.
**No tiene cliente HTTP propio**: comfy-cli es el motor y el dueño de todo el
I/O con ComfyUI.

Tres consecuencias prácticas que explican fallos que si no parecen magia negra:

1. **Si el CLI está roto, el MCP está roto**, y el mensaje de error va a hablar
   del CLI. Diagnosticar siempre de abajo hacia arriba.
2. **`comfy-cli` NO es una dependencia declarada de `comfy-mcp`**, a propósito:
   se resuelve por `PATH` o por `COMFY_BIN`, y la compatibilidad se verifica en
   runtime con un piso duro de **1.14.0** más una aserción del esquema del
   envelope. Por eso el quickstart instala las dos:
   `pip install comfy-mcp "comfy-cli>=1.14.0"`.
3. Los verbos que **no** emiten envelope (`launch`, `stop`, `model download`)
   se resuelven leyendo el texto impreso. Son los más frágiles.

Su contraparte es **Comfy Cloud MCP** (HTTP remoto, GPU de Comfy). Son dos
servidores distintos sin código compartido. Esta skill es del local.

---

## 2. El gotcha que más tiempo cuesta: `launch_failed` no habla del PATH

**`comfy launch --background` no usa el binario que lo invocó: el proceso hijo
re-invoca `comfy` por shell.** Si el `Scripts\` (o `bin/`) del venv no está en
el PATH del usuario, el launch falla con `launch_failed` y el log dice
*«"comfy" no se reconoce como un comando…»* — un mensaje que no menciona el
PATH ni sugiere la causa.

**`COMFY_BIN` no salva este caso.** Cubre los spawns *de comfy-mcp*, no el
re-spawn *interno de comfy-cli*. Son dos cosas distintas y es fácil creer que
una cubre a la otra.

**Regla de diagnóstico:** ante un `launch_failed`, comprobar PRIMERO que `comfy`
resuelva en el shell (`where comfy` / `which comfy`) antes de sospechar de
ComfyUI. `auditar_host.py` lo comprueba y lo dice con estas palabras.

---

## 3. Registrar el servidor

```
claude mcp add comfy --scope user --env COMFY_BIN=<...>/comfy.exe -- <...>/comfy-mcp.exe
```

**Scope usuario, no proyecto.** El stack de ComfyUI es de la máquina, no de un
repositorio: registrarlo por proyecto obliga a repetirlo en cada uno.

**Las tools aparecen en la SIGUIENTE sesión, no en la actual.** Registrar y
después buscar `mcp__comfy__server_info` en la misma sesión y no encontrarla no
es un fallo del registro.

---

## 4. Los flujos canónicos del MCP

**Siempre `server_info` primero.** De una sola llamada da si ComfyUI corre, su
URL, el hardware, la frescura de los packs, y —lo más importante para todo lo
demás— el `workspace.path`. De ahí salen las otras rutas.

**Generación larga:** `run_workflow(wait=False)` → `job(action="wait")` o
`job(action="status")` → `fetch_outputs`. Con `wait=True` una corrida lenta
bloquea la sesión entera; reservarlo para frases cortas.

**Descargas grandes:** `download_model` encola en un worker de fondo y devuelve
un `download_id`; se sigue con `download(action="wait"|"status"|"cancel")`.

**Plantillas de la galería:** `search_templates` → `fetch_template` → y solo
cuando `local_check` haya dado el visto bueno, `run_workflow` sobre
`result["path"]`. El catálogo está **cacheado aparte de la instalación**: que el
fetch funcione **no** prueba que el grafo se pueda correr. Y ojo con la forma de
la respuesta: `{"checked": false}` significa «no se pudo comparar», no es un
veredicto, y ese bloque **no trae la clave `runnable`** — leerla con `.get()`.

---

## 5. Los gates de consentimiento: no son un estorbo, son el diseño

comfy-mcp pide confirmación por *elicitation* MCP en todo lo que gasta dinero,
destruye estado, ejecuta código de terceros, mata procesos o expone la máquina:
`partner_generate`, `run_template`/`run_workflow` con `confirm_spend`,
`install_node` **en cada llamada**, `update_comfyui(target="all")`,
`switch_comfyui_version`, y el par launch/restart cuando `extra_args` publicaría
el ComfyUI a la red sin autenticación.

**El aviso se levanta incluso si el flag `confirm_*=True` viene puesto:** el
«permitir siempre» del cliente no es autoridad para publicar la máquina a la
red. No intentar rodearlo — está ahí a propósito, y coincide con la regla del
proyecto sobre acciones que exigen un sí explícito.

---

## 6. Formato API vs formato frontend — la confusión más cara

ComfyUI tiene **dos** serializaciones de un grafo:

| Formato | Forma | Quién lo usa |
|---|---|---|
| **API** | un dict plano `{"3": {"class_type":..., "inputs":...}}` | `comfy run`, `run_workflow` |
| **frontend** | `{"nodes": [...], "links": [...]}` | lo que exporta la UI |

**Todos los grafos de esta skill están en formato API.** De ahí sale una regla
dura: **`list_workflow_slots` y `set_workflow_slot` NO funcionan con ellos** —
exigen formato frontend. Para parametrizar uno de estos grafos se copia el
archivo a un temporal y **se edita la clave JSON directamente** (nodo → campo,
según `workflows/manifiesto.json`).

---

## 7. Los combos se validan contra el disco

Los campos `image`, `audio` y `prompt_file` **no aceptan rutas**: son
desplegables que ComfyUI llena leyendo carpetas reales.

| Campo | Carpeta que lee |
|---|---|
| `image`, `audio` | `<workspace>/input/` |
| `prompt_file` (voz Qwen3) | `<workspace>/models/Qwen3-TTS/prompts/` |

Si el archivo no está ahí, `validate` falla con **`unknown_enum_value`** — un
error que suena a grafo mal construido y en realidad solo dice *«ese archivo no
existe donde lo busco»*. Copiar el archivo a la carpeta y reintentar.

---

## 8. La VRAM: no preguntarle a `system_stats`

`system_stats` **reporta un valor desactualizado**: `free_memory` recién se
aplica cuando el worker itera. Para saber la VRAM libre de verdad:

```
nvidia-smi --query-gpu=memory.free --format=csv
```

Si falta memoria: `mcp__comfy__free_memory` y **volver a mirar con
`nvidia-smi`**, no con `system_stats`.

**Contexto real medido en esta máquina:** los modelos de imagen suman ~30 GB de
pesos sobre una tarjeta de 24 GB y **funcionan igual**, porque ComfyUI carga y
descarga dinámicamente. Es decir: que la suma de pesos exceda la VRAM **no** es
un veredicto de imposible. Pero tampoco es gratis — el 2026-08-25 ComfyUI murió
en seco corriendo `QwenImage` (19.582 MB) más su codificador (7.910 MB), sin
traceback y sin cierre ordenado, firma de un proceso terminado de golpe. No se
pudo probar que fuera por memoria, y esa honestidad importa: **el sistema no
siempre deja rastro cuando mata un proceso.**

**Regla de diagnóstico derivada de ese incidente:** si una ruta que habla con
ComfyUI devuelve un error de conexión **en milisegundos**, el motor está
apagado (es un rechazo inmediato). Si estuviera vivo pero atascado, ese número
sería de segundos.

---

## 9. El venv de ComfyUI es el Python útil de la máquina

`<workspace>/.venv/` trae `torch` con los kernels correctos para la GPU de esta
máquina, más `librosa` y `soundfile`. Es con ese Python que se corren los
scripts de audio de la skill `voz-local`.

**Importar desde él, nunca instalar dentro de él.** Es el entorno del motor y
romperlo sale caro. Si hace falta algo que no está, crear un venv propio.

---

## 10. Ruido conocido que NO son fallos

`SoX could not be found`, avisos de `flash-attn`, el aviso de symlinks de
HuggingFace en Windows. Ignorarlos.

Y uno de otra clase: **la consola de Windows muestra las tildes rotas aunque el
archivo esté perfecto.** Verificar los bytes del archivo, nunca lo impreso.
