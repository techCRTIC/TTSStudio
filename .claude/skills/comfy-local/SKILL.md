---
name: comfy-local
description: "Lleva un stack ComfyUI completo a cualquier PC o proyecto: audita si esta máquina puede correr lo que se le pide, instala lo que falte (comfy-cli, el servidor MCP `comfy`, ComfyUI, packs de nodos), y trae siete flujos ya validados —texto→imagen, edición con personaje de referencia, y clonación de voz— con el manifiesto de lo que cada uno necesita. Responde por capacidad, no por archivo: dice «no puedes editar personajes porque falta el LoRA de 810 MB», no una lista de rutas. Triggers: 'instala ComfyUI', 'configura el MCP de comfy', '¿puede este PC generar imágenes?', '¿qué me falta para correr ComfyUI?', 'auditar la máquina', 'porta el stack de comfy', 'genera una imagen', 'qué flujos tengo disponibles', 'comfy no arranca', 'launch_failed'."
argument-hint: "[auditar | instalar | flujos] [--capacidad <id>]"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, mcp__comfy__server_info, mcp__comfy__system_stats, mcp__comfy__free_memory, mcp__comfy__run_workflow, mcp__comfy__job, mcp__comfy__fetch_outputs, mcp__comfy__launch_comfyui, mcp__comfy__stop_comfyui, mcp__comfy__nodes, mcp__comfy__install_node, mcp__comfy__search_models, mcp__comfy__download_model, mcp__comfy__download, mcp__comfy__validate_workflow, mcp__comfy__upload_file, mcp__comfy__get_logs
---

Instala, audita y opera un stack **ComfyUI local** —motor, CLI y servidor MCP—
en cualquier máquina, y trae consigo los flujos que ya funcionan. Todo corre en
el equipo del usuario: sin API, sin costo por uso, sin subir nada a un tercero.

> **Lo que esta skill hace distinto: responde por CAPACIDAD, no por archivo.**
> Un listado de archivos ausentes no le sirve a nadie. *«No puedes editar
> personajes porque falta el LoRA de 810 MB en `models/loras/`»* sí.

**Es autosuficiente y portable.** Trae sus scripts (`scripts/`), los siete
grafos con su manifiesto (`workflows/`) y el conocimiento que costó averiguar
(`referencias/`). Las rutas de la máquina **se descubren, nunca se asumen**: una
ruta absoluta escrita a mano dentro de `scripts/` es un defecto, porque entonces
la skill no portea nada. (Las que aparecen en `manifiesto.json` y en las
referencias son **procedencia** —de qué máquina salió esto y con qué se midió—,
no rutas que el código use.)

| Pieza | Para qué |
|---|---|
| `scripts/auditar_host.py` | ¿Puede esta máquina hacer lo que se pide? Y si no, qué falta |
| `scripts/instalar_stack.py` | El plan de instalación exacto. Por defecto solo imprime |
| `workflows/manifiesto.json` | Qué necesita cada flujo y qué campo se toca para usarlo |
| `referencias/comfy-cli-y-mcp.md` | Cómo funciona el stack y los gotchas que cuestan horas |
| `referencias/flujos.md` | Los siete flujos, uno por uno |

Los scripts son **stdlib pura**: corren con cualquier Python 3.10+, sin instalar
nada. Es deliberado — la primera vez que se usa esta skill en un PC nuevo, no
hay nada instalado todavía.

---

## Fase 0 — Auditar. SIEMPRE, antes de nada

```bash
python scripts/auditar_host.py
```

Cuatro capas de abajo hacia arriba —máquina, herramientas, ComfyUI,
capacidades— y un veredicto por capacidad. Códigos de salida: `0` si alguna
capacidad está lista, `1` si ninguna, `2` si no hay ComfyUI en la máquina.

```bash
python scripts/auditar_host.py --exigir clonar-voz   # ¿puedo hacer ESTO?  (0/1)
python scripts/auditar_host.py --json                # para encadenar
```

**Leer los tres estados como lo que son:**

| Estado | Significa |
|---|---|
| `[OK]` lista | las piezas están **y** se verificaron contra el ComfyUI vivo |
| `[?]` probable | las piezas están, pero ComfyUI está apagado: los nodos se creen del manifiesto |
| `[FALTA]` | falta algo concreto, y dice qué y cuánto pesa |

**`[?]` no es un problema, es una advertencia honesta.** Para convertirlo en
`[OK]`, encender ComfyUI (`mcp__comfy__launch_comfyui` o
`comfy --skip-prompt launch --background`) y volver a auditar: entonces cada
clase de nodo se consulta contra `/object_info` del servidor real.

**Si `launch` falla con `launch_failed`**, no sospechar de ComfyUI: comprobar
primero que `comfy` resuelva en el shell. Es el gotcha del PATH, y la auditoría
ya lo reporta con nombre y apellido (`referencias/comfy-cli-y-mcp.md` § 2).

**No presentar «capacidad lista» como «va a salir bien».** Significa que las
piezas están. Si la salida es buena lo decide un humano mirando o escuchando.

---

## Fase 1 — Instalar lo que falte

```bash
python scripts/instalar_stack.py             # imprime el plan, no ejecuta nada
python scripts/instalar_stack.py --ejecutar  # solo el tramo reversible
```

**Nunca instalar ni descargar sin permiso.** Los modelos pesan GB y es decisión
del usuario; los packs de nodos son código de terceros. El script está escrito
para que ese límite sea estructural y no dependa de que alguien se acuerde: por
defecto imprime y se calla, y `--ejecutar` toca **solo** el tramo barato y
reversible (crear el venv de herramientas, `pip install`, registrar el MCP).

Lo demás se imprime siempre y no se ejecuta nunca desde ahí:

| Pieza | Por qué se queda fuera |
|---|---|
| Instalar ComfyUI | decenas de GB, y la ruta la elige el usuario |
| Packs de nodos | código de terceros; el MCP pide consentimiento por llamada |
| Modelos | entre 0,2 y 19,5 GB por archivo |
| El PATH de usuario | escribir el entorno de otro proceso a sus espaldas |

**Sobre las URL de los modelos: la skill no las inventa.** Un enlace recordado
de memoria que devuelve 404 cuesta más que no darlo. Cada modelo ausente sale
con su carpeta destino, su tamaño, y la consulta de `mcp__comfy__search_models`
que resuelve su origen contra el catálogo real. Después,
`mcp__comfy__download_model` baja en segundo plano y se sigue con
`download(action="status")` — pero **preguntando antes**, siempre, con el total
en GB por delante.

Tras instalar un pack de nodos: **sus dependencias no se instalan solas** y hay
que **reiniciar ComfyUI**. La auditoría no lo verá hasta entonces.

---

## Fase 2 — Elegir el flujo

`referencias/flujos.md` tiene los siete, uno por uno, con sus tiempos medidos y
sus trampas. En una línea cada uno:

| Quiero… | Flujo | Tiempo |
|---|---|---|
| una imagen desde texto | `t2i_qwen_lightning` | ~8 s |
| … y el rápido no me convence en un detalle | `t2i_qwen_full_quality` | ~119 s |
| **el mismo personaje en otra escena** | `edit_qwen_lightning` | ~28 s |
| … con poses algo más dinámicas | `edit_qwen_full_quality` | ~216 s |
| clonar una voz de una referencia suelta | `tts_voice_clone` | ~20 s |
| guardar una voz para reusarla | `tts_voice_prompt_make` | ~5 s |
| generar con una voz ya guardada | `tts_voice_clone_cached` | ~20 s |

**Para voz, seguir en la skill `voz-local`.** Aquí están los grafos; allá está
lo que decide la calidad: cómo escribir el texto (la palanca principal, medida),
cómo preparar una referencia, el QA de la salida sin escucharla, y por qué casi
nunca conviene entrenar un modelo. Esta skill deja la máquina lista; `voz-local`
la usa bien.

**Sobre clonar la voz de una persona real:** no es un asset cualquiera.
Confirmar que autorizó su uso y para qué, antes de generar.

---

## Fase 3 — Correr

Los grafos están en **formato API** con marcadores `PLACEHOLDER:` y
`REEMPLAZAR_`. El ciclo:

1. **Copiar el grafo a un temporal.** Nunca editar el de la skill: es la versión
   de referencia y no debe acumular los parámetros de una corrida.
2. **Editar la clave JSON directamente** (nodo → campo, según el manifiesto).
   **No usar `set_workflow_slot`**: exige formato *frontend* y estos archivos
   son formato *API*. Falla de una forma que parece un problema del grafo.
3. Poner las entradas donde van: `image`/`audio` en `<workspace>/input/`, las
   voces en `models/Qwen3-TTS/prompts/`. Son desplegables validados contra el
   disco, no rutas; si el archivo no está, `validate` dice `unknown_enum_value`,
   que suena a grafo roto y solo significa «ese archivo no existe ahí».
4. `run_workflow(workflow_path=..., wait=False)` → `job(action="wait")` →
   `fetch_outputs`. Con `wait=True` una corrida lenta bloquea la sesión.

**Cuando la salida es audio: generar UNA muestra y esperar el veredicto humano
antes de la tanda.** Regla nacida de un error real — se generaron ~25 audios
antes de que alguien escuchara el primero, y **todos** tenían el texto mal
escrito. Ninguna métrica objetiva podía verlo.

---

## Diagnóstico rápido

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `launch_failed` | el `Scripts\` del venv no está en el PATH | `where comfy` **primero**. `COMFY_BIN` no cubre este caso |
| Las tools `mcp__comfy__*` no existen | servidor no registrado, o registrado en esta misma sesión | `claude mcp add comfy --scope user`; aparecen en la SIGUIENTE sesión |
| `unknown_enum_value` | combo validado contra el disco | poner el archivo en la carpeta que corresponde |
| `set_workflow_slot` falla | el grafo está en formato API | editar el JSON directo |
| Una imagen editada sale como grilla rota o duplicada | grafo del modelo *base* con el modelo 2511 | usar `edit_qwen_lightning.json`, que ya trae los tres nodos correctos |
| Error de conexión **en milisegundos** | ComfyUI apagado (rechazo inmediato) | encenderlo. Si estuviera atascado, la espera sería de segundos |
| Falta VRAM | — | `free_memory` y volver a medir con `nvidia-smi`, **no** con `system_stats` |
| `SoX could not be found`, avisos de `flash-attn` | ruido conocido | ignorar |
| Tildes rotas en la consola | Windows imprime en cp1252 | mirar los bytes del archivo, no lo impreso |

---

## Puntos ciegos de esta skill — dichos, para que nadie le acredite de más

- **La auditoría verifica que un modelo EXISTA, no que sea el correcto ni que
  esté íntegro.** Un archivo truncado o renombrado la pasa.
- **Los nodos del núcleo solo se verifican de verdad con ComfyUI encendido.**
  Apagado, se creen del manifiesto, y la salida lo dice.
- **Los tiempos son de una RTX 5090 Laptop de 24 GB.** En otra máquina son
  órdenes de magnitud, no promesas.
- **Que la suma de pesos exceda la VRAM no es un veredicto de imposible**:
  ComfyUI carga y descarga dinámicamente, y en esta máquina ~30 GB de modelos
  corren sobre 24 GB. Pero tampoco es gratis, y un motor puede morir en seco sin
  dejar rastro de por qué.
- **Ningún flujo se corre como parte de la auditoría.** Nada de lo que reporta
  prueba que la salida sea buena.

---

## Procedencia

El stack y los siete grafos salieron de la investigación `comfy-mcp`
(2026-08-18/19), a base de prueba y error con veredicto humano. Vivían en
`C:\Users\tech\comfy-workflows\`, una carpeta **fuera de todo repositorio**, con
una razón escrita: el servidor MCP está registrado a nivel de usuario, así que
los grafos debían ser igual de universales.

**Esta skill invierte esa decisión a propósito.** Una carpeta suelta en el disco
de una máquina es universal *dentro de esa máquina* y no viaja a ninguna otra.
Metido en una skill versionada, el mismo conocimiento cruza a otro PC copiando
un directorio. El precio es que los grafos ahora existen en dos sitios; la
versión de la skill manda, y `auditar_host.py` es lo que impide que se vuelva
ficción — comprueba el manifiesto contra el disco real de la máquina en que
esté corriendo.
