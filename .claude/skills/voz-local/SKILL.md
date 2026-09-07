---
name: voz-local
description: "Genera voz con IA en local (Qwen3-TTS sobre ComfyUI vía el MCP `comfy`): clonar una voz desde una referencia corta, narrar textos, registrar voces reutilizables y —si de verdad se justifica— entrenar un modelo de voz. Verifica dependencias antes de generar, revisa el texto (las dos palancas de calidad son ortografía y puntuación, no el modelo), genera una muestra para validación humana y hace QA automático de la salida. Triggers: 'clona esta voz', 'genera un audio', 'hazme una narración', 'voz en off', 'locución', 'sintetiza este texto', 'text to speech', 'TTS', 'quiero que suene como', 'entrenar una voz', 'fine-tune de voz'."
argument-hint: "[texto o ruta al guion] [--voz <nombre>] [--registrar-voz] [--solo-preflight]"
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion, mcp__comfy__server_info, mcp__comfy__system_stats, mcp__comfy__free_memory, mcp__comfy__run_workflow, mcp__comfy__job, mcp__comfy__launch_comfyui, mcp__comfy__nodes, mcp__comfy__install_node, mcp__comfy__get_logs
---

Genera voz en local con **Qwen3-TTS** sobre ComfyUI, a través del servidor MCP
`comfy`. Todo corre en la máquina del usuario: sin API, sin costo por uso, sin
subir la voz de nadie a un tercero.

> **Lo más importante de esta skill no son los grafos: son las dos reglas de la
> Fase 2.** La calidad de un TTS depende más de cómo está escrito el texto que
> del modelo que lo dice. Un clon zero-shot con el texto bien escrito le gana a
> un modelo entrenado con el texto mal escrito. Está medido, no supuesto.

Alcance: **voz**. Este stack no hace música ni efectos de sonido — si piden eso,
decirlo en vez de improvisar.

**Esta skill es autosuficiente.** Trae sus propios scripts (`scripts/`), grafos
(`workflows/`) y material de apoyo (`referencias/`). Todas las rutas de abajo
son relativas a la carpeta de la skill; las de la máquina se **descubren**, no
se asumen.

| Script | Para qué |
|---|---|
| `tts_voces.py` | Ver y registrar las voces disponibles |
| `tts_preparar_referencia.py` | Convertir una grabación en referencia lista |
| `tts_normalizar_texto.py` | Números, fechas y montos a su forma hablada |
| `tts_revisar_texto.py` | Portero de calidad del texto (bloquea si algo está mal) |
| `tts_narrar_largo.py` | Guiones que superan el techo de una pasada |
| `tts_qa_audio.py` | QA de la salida sin escucharla |

Correrlos con un Python que tenga `librosa`, `soundfile` y `numpy` — típicamente
el venv de ComfyUI. (`tts_revisar_texto.py` y `tts_normalizar_texto.py` son
stdlib pura y corren con cualquiera.)

---

## Fase 0 — Preflight de dependencias (SIEMPRE, antes de nada)

Nunca instalar ni descargar sin permiso: los modelos pesan GB y es decisión del
usuario. Detectar, reportar, y **preguntar**.

**0.1 — Infraestructura.** Llamar `mcp__comfy__server_info`. Da de una vez si
ComfyUI corre, su URL, el hardware y la frescura de los packs. **Anotar
`workspace.path`: de ahí salen todas las rutas siguientes.** Llamarlo `$WS`.

| Síntoma | Significa | Qué hacer |
|---|---|---|
| `server.running: false` | ComfyUI apagado | Ofrecer `mcp__comfy__launch_comfyui`. Si da `launch_failed`, es el gotcha del PATH: `comfy launch` re-invoca `comfy` por shell y necesita el `Scripts\` del venv de comfy-cli en el PATH de usuario. |
| La tool MCP no existe | Servidor `comfy` no registrado | Pedir al usuario: `claude mcp add comfy --scope user`, con `COMFY_BIN` al `comfy` del venv. |
| `freshness.core.outdated` | ComfyUI viejo | Solo mencionarlo. No bloquea. |

**0.2 — Piezas de voz.** Con `$WS` del paso anterior:

```bash
ls "$WS/custom_nodes/ComfyUI-Qwen3-TTS/"      # pack de nodos
ls "$WS/models/Qwen3-TTS/"                     # modelo base (~3-4 GB)
ls "$WS/models/Qwen3-TTS/prompts/"             # voces ya registradas (~28 KB c/u)
ls "$WS/input/"*.wav                           # audios de referencia disponibles
```

| Falta | Cómo resolverlo (preguntar antes) |
|---|---|
| Pack `ComfyUI-Qwen3-TTS` | `mcp__comfy__install_node` y reiniciar ComfyUI. **Sus deps no se instalan solas**: `pip install -r requirements.txt` con el Python del venv de ComfyUI (`qwen-tts`, `modelscope`, `soundfile`, `librosa`). |
| Modelo base | Se descarga solo en el primer uso (~3-4 GB). Avisar del tiempo **antes** de lanzar. |
| Audio de referencia | Es insumo del usuario. Pedirlo: 10-15 s de habla limpia, sin música ni ruido. |
| `ffmpeg` | Buscarlo con `which ffmpeg`; si no está en el PATH puede existir igual (suele venir con Shutter Encoder, DaVinci, OBS). `scripts/tts_preparar_referencia.py` ya prueba las rutas típicas. **No instalar sin preguntar.** |
| `whisper` / `librosa` | Solo para preparar una referencia nueva o hacer QA. Verificar con el Python del venv de ComfyUI. |

**0.3 — VRAM**, si se viene algo pesado:
`nvidia-smi --query-gpu=memory.free --format=csv`.
**No confiar en `system_stats` para esto**: reporta un valor desactualizado
porque `free_memory` se aplica recién cuando el worker itera. Si falta VRAM,
`mcp__comfy__free_memory` y volver a mirar con `nvidia-smi`.

Cerrar con un resumen de una línea por dependencia. Si falta algo, un
`AskUserQuestion` con las opciones concretas.

---

## Fase 1 — Enrutar

Empezar viendo qué voces hay: `python scripts/tts_voces.py listar`.

| Situación | Camino |
|---|---|
| Generar con una voz ya registrada | Fase 2 → `workflows/tts_voice_clone_cached.json` |
| Hay un audio de referencia nuevo | Fase 1b, luego Fase 2 |
| Referencia de un solo uso | Fase 2 → `workflows/tts_voice_clone.json` |
| **Guion largo** (más de ~600 caracteres) | Fase 3b → `scripts/tts_narrar_largo.py` |
| "Que suene alegre / triste / susurrando" | Fase 2, **con puntuación**, no con `instruct` |
| "Entrenemos un modelo con mi voz" | Fase 5. **Casi siempre la respuesta es no.** |

**Sobre la voz de una persona real:** no es un asset cualquiera. Antes de
clonar a alguien, confirmar que autorizó su uso y para qué. `tts_voces.py`
tiene un campo `--consentimiento` para dejarlo por escrito junto a la voz.

### Fase 1b — Registrar una voz nueva

```bash
python scripts/tts_preparar_referencia.py grabacion.m4a --salida-dir ./ref
```

Transcribe con Whisper `large-v3`, elige una ventana de **frases completas y
consecutivas** de 10-15 s, y recorta el audio ahí. Deja el par WAV + texto con
correspondencia exacta.

**Por qué el recorte importa tanto:** el par (`ref_audio`, `ref_text`) es un
prompt de aprendizaje en contexto — el modelo alinea uno contra otro. Si el
texto declara palabras que el audio **no** contiene, ese sobrante **se filtra en
la generación** y aparecen frases que nadie pidió, típicamente al principio.
Pasó de verdad: un filtro `start < limite` dejó entrar un segmento que empezaba
antes del corte pero terminaba 2,3 s después. **La condición correcta es
`end <= limite`.**

Nunca transcribir con Whisper `small` para esto: sus errores quedan escritos en
la referencia y degradan cada generación futura.

Después: copiar el WAV a `$WS/input/` y correr
`workflows/tts_voice_prompt_make.json` → deja un `.safetensors` de ~20-30 KB en
`$WS/models/Qwen3-TTS/prompts/`. La voz queda como asset portátil.

Cerrar registrándola, para que no quede un archivo sin contexto:

```bash
python scripts/tts_voces.py registrar <nombre> --de "de qué grabación salió" \
    --ref-texto-archivo ref/ref.txt --duracion 10.6 \
    --consentimiento "para qué autorizó su uso"
```

---

## Fase 2 — Preparar el texto (LA FASE QUE MÁS IMPORTA)

**Obligatorio antes de generar**, en este orden:

```bash
# 1. Números, fechas y montos a su forma hablada
python scripts/tts_normalizar_texto.py --archivo guion.txt --salida guion_hablado.txt
# 2. Portero de calidad: sale con 1 si hay algo bloqueante
python scripts/tts_revisar_texto.py --archivo guion_hablado.txt
```

**No generar con bloqueantes pendientes.**

`tts_normalizar_texto.py` convierte `31/12/2026` → "treinta y uno de diciembre
de dos mil veintiséis", `$12.800.000` → "doce millones ochocientos mil pesos",
`9:30` → "las nueve y media", y concuerda género y número ("veintiún años",
"una persona", "a la una"). **Las siglas no las adivina**: las reporta para que
un humano decida cómo se pronuncian (`--siglas` con un JSON), porque "CRTIC"
puede ser deletreado o leído y equivocarse suena peor que preguntar.

### Regla 1 — Español correcto, siempre

Tildes, ñ y signos de apertura `¿` `¡`. Nunca normalizar a ASCII. La tilde marca
**dónde cae el acento prosódico**: sin ella el modelo lee "ficcion" como
*FIC-cion* en vez de *fic-CIÓN*, y el acento mal puesto es una de las señales
más fuertes de que una voz suena **extranjera**. Medido: corregir la ortografía
cambió la locución entre **+15% y +29%**.

En Python: `json.dump(..., ensure_ascii=False)` y `encoding="utf-8"` en todo.
**La consola de Windows muestra los acentos rotos aunque el archivo esté bien** —
verificar el archivo, no lo impreso.

### Regla 2 — La puntuación es el control de prosodia

Es la palanca más fuerte que existe acá: mueve el ritmo **3,5× más** que el
parámetro `instruct` de un modelo entrenado (+54% vs +15%), y es gratis.

- Puntos suspensivos `...` donde se quiera una pausa real.
- Frases cortas para dar peso; largas para fluidez.
- Preguntas con `¿` de verdad.
- Números **en palabras** ("treinta y uno", no "31").

```
Neutro : Ayer terminamos el proyecto. Fueron seis meses de trabajo y ahora se acabó.
Pausado: Ayer... terminamos el proyecto. Fueron seis meses. Seis meses de trabajo... y ahora, se acabó.
```

**Si piden emoción, la vía es esta.** El parámetro `instruct` solo existe en
`Qwen3CustomVoice` y **no funciona con voz clonada** — verificado en la
librería: `generate_voice_clone` no lo acepta en ninguna forma.

---

## Fase 3 — Generar UNA muestra y entregarla

**Regla dura, nacida de un error real:** cuando la salida es audio, generar
**una** muestra, entregarla al usuario y **esperar su veredicto** antes de
producir la tanda. Claude no puede oír. En la sesión que originó esta skill se
generaron ~25 audios antes de que un humano escuchara el primero — y **todos**
tenían el texto mal escrito. Ninguna métrica objetiva podía verlo.

| Grafo (en `workflows/`) | Para qué |
|---|---|
| `tts_voice_clone.json` | Clonar con un WAV de referencia directo |
| `tts_voice_prompt_make.json` | Registrar una voz (una sola vez) |
| `tts_voice_clone_cached.json` | Generar con una voz ya registrada |

Vienen en **formato API** con marcadores `REEMPLAZAR_*` y `PLACEHOLDER:`.
Copiar a un temporal, reemplazar, y correr con
`mcp__comfy__run_workflow(workflow_path=..., wait=False)` + `mcp__comfy__job`
para textos largos; `wait=True` solo para frases cortas.

**No usar `set_workflow_slot`**: exige formato *frontend* (`nodes[]`/`links[]`)
y estos archivos están en formato *API*. Editar el JSON directo.

**Los campos `audio` y `prompt_file` son combos validados contra el disco**, no
aceptan rutas: el archivo tiene que estar en `$WS/input/` o
`$WS/models/Qwen3-TTS/prompts/` respectivamente. Si no está, `validate` falla
con `unknown_enum_value` — que parece un error del grafo y solo dice "falta el
archivo".

Si la máquina tiene una colección local de grafos (p. ej. `~/comfy-workflows/`),
usarla: suele estar más afinada. Los de `workflows/` son el respaldo portable.

---

## Fase 3b — Guiones largos

El modelo topa en ~3 min de audio y 2048 caracteres por pasada. Cualquier
locución real los supera, así que hay que trocear, generar y unir:

```bash
python scripts/tts_narrar_largo.py guion.txt --voz mi_voz.safetensors --salida narracion.wav
python scripts/tts_narrar_largo.py guion.txt --voz v.safetensors --solo-trocear   # ver el plan primero
```

Qué hace que no sea trivial:

- **Trocea por frases completas**, nunca a mitad de oración — cortar en medio
  destruye la entonación de las dos mitades.
- **Verifica cada trozo** contra el bug de loop y **regenera con otra semilla**
  si falla. Sin esto un solo trozo malo obliga a rehacer la locución entera.
- **Une con pausas distintas**: corta entre frases, larga entre párrafos. Los
  silencios son lo que hace que un montaje suene como una sola lectura.
- Si un trozo falla todos los reintentos, **lo dice y sale con código 1** en vez
  de entregar un audio con un hueco silencioso.

Respeta los saltos de párrafo del archivo original: escribir el guion con
líneas en blanco donde va una pausa larga es parte del control.

---

## Fase 4 — QA automático antes de entregar

```bash
python scripts/tts_qa_audio.py salida.flac --texto "el texto que debía decir"
python scripts/tts_qa_audio.py "carpeta/*.flac"       # modo comparativo
```

Atrapa lo medible: loop infinito (audio mucho más largo de lo que el texto
justifica), truncado, silencio, saturación, y **outliers dentro de una tanda**
(mediana ±25%) — la forma más fiable de pillar el bug de loop.

**No juzga calidad ni detecta palabras mal dichas.** Eso siempre lo decide el
usuario escuchando.

---

## Fase 5 — Fine-tune: cuándo NO hacerlo (casi siempre)

| Audio disponible | Veredicto |
|---|---|
| < 10 min | **No entrenar.** Usar clon zero-shot. |
| 10-20 min | Solo si se necesita `instruct`, asumiendo deriva de acento. |
| 25-40 min grabados a propósito | Acá empieza a ganarle al clon. |
| 1 h+ | Rendimientos decrecientes. |

Con 8,8 min el fine-tune **perdió** contra el clon: no sonó mejor y derivaba al
acento castellano con texto fuera de dominio. La causa es mecánica — el clon se
condiciona sobre **audio real** en cada inferencia, mientras el fine-tune usa un
**embedding aprendido** y nunca ve audio; con datos escasos capta el timbre pero
no sobrescribe el prior de español del modelo base.

**La composición pesa más que el total:** 30 min leídos a propósito valen más
que 60 de entrevista. El dataset que falló tenía **0 preguntas y 0
exclamaciones** en 129 clips — el modelo nunca vio una entonación interrogativa,
y ahí exactamente se quebró.

Si se va a grabar: **`referencias/guion-grabacion-30min.md`** trae un guion
listo, diseñado para cobertura y no para contenido (8 bloques: declarativas,
preguntas, exclamaciones, números, nombres propios, registros emocionales,
frases cortas y lectura corrida), con las metas de proporción y las
instrucciones de sala y micrófono.

Y antes de entrenar, **contar el dataset**: clips con `?`, con `!` y con
números. Si alguno da cero, el guion no se leyó completo y el fine-tune va a
fallar en esa dimensión.

Antes de usar cualquier audio largo como insumo, **verificar que no sea un
loop**: un archivo de 37 min resultó ser una grabación de 9,96 min repetida 3,74
veces (correlación cruzada 0.999 con desfase 0 entre `t` y `t+P`, contra 0.02
entre instantes no relacionados). Un archivo largo no garantiza contenido largo.

Si de verdad corresponde entrenar, el pipeline completo (transcribir → segmentar
→ filtrar por voz → armar dataset → entrenar → evaluar) existe como nodos de
ComfyUI del propio pack: `Qwen3DatasetFromFolder → Qwen3DataPrep →
Qwen3FineTune`. No hace falta clonar el repo de QwenLM. El grafo **necesita un
nodo terminal** (`PreviewAny`) o ComfyUI no ejecuta nada.

---

## Diagnóstico rápido

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Suena extranjero / castellano | Texto sin tildes | Fase 2, regla 1. **Revisar el texto ANTES de culpar al modelo.** |
| Dice palabras que nadie pidió | `ref_text` declara más de lo que el audio contiene | Fase 1b: recortar en límites de frase |
| `ValueError` al clonar | Falta `ref_text` | Es opcional en el schema pero **obligatorio en la práctica** |
| Se cuelga, GPU al 100% | Bug de loop upstream | Bajar `max_new_tokens`, referencia <30 s, cambiar semilla |
| `unknown_enum_value` | Combos validados contra el disco | Poner el archivo en la carpeta que corresponde |
| Plano, sin emoción | Falta puntuación prosódica | Fase 2, regla 2 |
| `SoX could not be found` / `flash-attn` | Ruido conocido, **no son fallos** | Ignorar |

**Techos del modelo:** ~3 min de audio por pasada (8192 tokens), 2048 caracteres
de entrada. Para más largo, trocear por frases y concatenar con ffmpeg.

**Semillas:** casi no importan (7 de 8 dentro de un 7 % de dispersión). `42` es
la usada en todo lo validado. No barrer semillas buscando calidad; sí desconfiar
de una salida mucho más larga que sus hermanas — eso es el bug de loop.

---

## Procedencia

Todo lo de acá salió de la investigación `comfy-mcp` (2026-08-18/19), a base de
prueba y error con veredicto humano al oído. Si esta skill viaja a otro repo,
viaja completa: `SKILL.md` + `scripts/` + `workflows/` no dependen de nada más
que del stack de ComfyUI en la máquina destino.
