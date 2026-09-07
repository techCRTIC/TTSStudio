# Los siete flujos — qué hace cada uno y qué tocar

Grafos de ComfyUI **en formato API**, validados en una RTX 5090 Laptop (24 GB).
Cada uno costó una sesión de depuración real; reusar le gana a regenerar.

Los tiempos son **medidos en esa máquina**, con el modelo ya cargado en VRAM
salvo donde diga «en frío». En otra máquina son órdenes de magnitud, no
promesas. `scripts/auditar_host.py` dice cuáles corren aquí y qué falta para el
resto; `workflows/manifiesto.json` es la fuente de la que sale esa respuesta,
campos editables incluidos.

**Antes de cualquier cosa:** los campos `image`, `audio` y `prompt_file` son
desplegables validados contra el disco, no rutas. Ver
[`comfy-cli-y-mcp.md`](comfy-cli-y-mcp.md) § 7.

---

## Imagen

### `t2i_qwen_lightning.json` — texto → imagen, rápido
**Qwen-Image 2512 + LoRA Lightning** (Apache 2.0). **~8 s** en caliente, ~29 s
en frío. **El default para cualquier imagen nueva sin referencia.**

| Qué cambiar | Nodo → campo |
|---|---|
| El prompt (en inglés) | `5.inputs.text` |
| La semilla | `8.inputs.seed` |
| Tamaño (1216×832 por defecto) | `7.inputs.width` / `.height` |

El negativo del nodo 6 está en chino **a propósito**: es el negativo oficial de
Qwen-Image. No tocarlo sin un motivo.

### `t2i_qwen_full_quality.json` — texto → imagen, calidad completa
Mismo modelo, **sin LoRA**. `steps=50, cfg=4.0` (defaults oficiales). **~119 s.**
Solo si el rápido no convence en un detalle puntual: la mejora es real pero
marginal (~10-15%) por **16× el tiempo**. Mismos campos (nodos 5/7/8).

### `edit_qwen_lightning.json` — personaje de referencia → escena nueva
**Qwen-Image-Edit 2511 + LoRA Lightning.** **~28 s.** **Esta es la receta
ganadora** para consistencia de personaje: validada dos veces, identidad
preservada en ambas.

| Qué cambiar | Nodo → campo |
|---|---|
| Imagen de referencia (debe estar en `input/`) | `4.inputs.image` |
| La instrucción de edición | `9.inputs.prompt` |
| La semilla | `14.inputs.seed` |

> ⚠️ **El gotcha que este archivo ya resuelve.** El modelo 2511 exige
> `TextEncodeQwenImageEditPlus` —**no** `TextEncodeQwenImageEdit`, que es del
> modelo *base*— más `FluxKontextImageScale` y
> `FluxKontextMultiReferenceLatentMethod`. Sin ellos la salida **colapsa**:
> grillas rotas, personajes duplicados. Es el tipo de fallo que parece del
> modelo y es del grafo.

Terminar **siempre** la instrucción pidiendo que el personaje no cambie: solo la
pose, el fondo y la acción. Sin esa coletilla el parecido se pierde.

### `edit_qwen_full_quality.json` — igual, calidad completa
Sin LoRA, `steps=40, cfg=3`. **~216 s.** Poses algo más dinámicas, a **7,6× el
costo**. ⚠️ **Los números de nodo NO son los mismos** que en la versión rápida:
referencia `4.inputs.image`, instrucción `8.inputs.prompt`, semilla
`13.inputs.seed`.

---

## Voz

Los tres usan **Qwen3-TTS 1.7B Base** y necesitan el pack `ComfyUI-Qwen3-TTS`.
El modelo base (~4,3 GB) **se descarga solo** en el primer uso; avisar del
tiempo antes de lanzar.

> **Para generar voz de verdad, la referencia es la skill `voz-local`**, no
> ésta. Aquí están los grafos y sus límites; allá está lo que decide la calidad:
> cómo se escribe el texto, cómo se prepara una referencia, el QA de la salida y
> cuándo NO entrenar un modelo. Resumido en una frase: **la palanca principal no
> es el modelo, es la ortografía y la puntuación del texto** — medido, no
> supuesto.

### `tts_voice_clone.json` — clonar desde una referencia corta
**~20 s** para ~20 s de salida. Para una referencia de un solo uso.

| Qué cambiar | Nodo → campo |
|---|---|
| Audio de referencia (en `input/`, 10-15 s limpios) | `2.inputs.audio` |
| Transcripción exacta de esa referencia | `3.inputs.ref_text` |
| El texto a decir | `3.inputs.text` |
| Idioma (`Auto`, `Spanish`, …) | `3.inputs.language` |

**`ref_text` es opcional en el esquema pero obligatorio en la práctica:**
`Qwen3VoiceClone` lanza `ValueError` si recibe `ref_audio` sin él.

**Techos del modelo:** ~3 min de audio por pasada (8192 tokens), **2048
caracteres** de entrada. Para más largo hay que trocear por frases.

**Sin control nativo de velocidad ni emoción en modo clon** — verificado en la
librería, no solo en el nodo: `generate_voice_clone` no acepta `instruct` en
ninguna forma. La vía para la emoción es la puntuación del texto.

### `tts_voice_prompt_make.json` — precalcular una voz y guardarla
Convierte una referencia en un *embedding* y lo guarda como `.safetensors` en
`models/Qwen3-TTS/prompts/`. **~5 s**, y el archivo pesa entre 20 y 50 KB.
Una sola vez por voz.

| Qué cambiar | Nodo → campo |
|---|---|
| Audio de referencia | `2.inputs.audio` |
| Transcripción | `3.inputs.ref_text` |
| Nombre con que se guarda | `4.inputs.filename` |

La voz queda como **asset portátil**: ya no depende de conservar el WAV.

### `tts_voice_clone_cached.json` — generar con una voz ya guardada
Carga el embedding con `Qwen3LoadPrompt` y sintetiza sin reprocesar el audio.
Con `prompt` conectado **no se pasan `ref_audio` ni `ref_text`**.

| Qué cambiar | Nodo → campo |
|---|---|
| Voz a usar | `2.inputs.prompt_file` |
| El texto (¡con puntuación prosódica!) | `3.inputs.text` |
| La semilla | `3.inputs.seed` |

Si la voz no está registrada todavía, `validate` falla con `unknown_enum_value`
y la pista *«no prompts saved yet»*. Registrarla primero.

---

## Cómo correrlos

```
run_workflow(workflow_path="<copia editada>.json", wait=False)
job(action="wait")  →  fetch_outputs
```

Por CLI, el equivalente:

```
comfy --skip-prompt --json --where local run --workflow <archivo>.json --wait --timeout 300
```

**Nunca editar el archivo de la skill: copiarlo a un temporal y editar la copia.**
Son la versión de referencia y no deben acumular los parámetros de una corrida.

---

## Sobre las semillas

Casi no importan para la calidad: 7 de 8 quedaron dentro de un 7% de dispersión.
`42` es la usada en todo lo validado. **No barrer semillas buscando calidad.**
Sí desconfiar de una salida de audio mucho más larga que sus hermanas: eso es el
bug de bucle, no una variación.

## Lo que este stack NO hace

**Música ni efectos de sonido.** Si los piden, decirlo en vez de improvisar.
