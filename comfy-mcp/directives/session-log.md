# Bitácora de sesiones — Comfy MCP

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada: fecha/hora, qué pidió el usuario, acciones, decisiones
> (con alternativas descartadas), resultados y próximos pasos.

## 2026-08-18 — Investigación creada
**Time:** (inicio de sesión, aprox)
**User request:** "mira quiero investigar esto https://github.com/Comfy-Org/comfy-mcp" — llegó vía `/start`, desde un link de newsletter (utm de Substack).
### Actions taken
- `/start` scaffoldeó esta investigación (slug `comfy-mcp`, confirmado por el usuario).
- Fila añadida a `investigaciones/INDEX.md`; puntero raíz `production/session-state/active.md` reescrito.
### Decisions
- Slug `comfy-mcp` (título "Comfy MCP") — el usuario descartó `comfyui-mcp`.
- Primer movimiento: **scan del repo** con `/repo-scan` (descartado: definir alcance primero, o partir por el ecosistema).
- `/repo-scan` corrido con intensidad **Estándar** (elegida por el usuario): clon shallow en `.tmp/`, lectura de README, pyproject, AGENTS.md, núcleo de `server.py` (spawn + envelope) y tabla de las 39 tools.
- Scan escrito en `comfy-mcp_RepoScan.md` (raíz de esta investigación).
- Archivado en el vault (aprobado por el usuario): `Research/GitHub_Repos/comfy-mcp_Research.md` + entradas en `Indice_Repos_GitHub.md` (sección SDKs & Protocolos IA) y `Research/Index.md`.
### Outcomes
- Scaffold completo + scan Estándar terminado y archivado en Obsidian.
- Hallazgos clave: wrapper delgado sobre comfy-cli (39 tools passthrough, sin HTTP propio); la joya es el diseño de consentimiento por elicitation MCP (prompt incluso con `confirm_*=True`); calidad inusual (~2x test/código, CI 3.10+3.14, decisiones comentadas); comfy-cli no declarada como dep a propósito (piso runtime ≥1.14.0); licencia dual AGPL/comercial.
### Experimento en vivo (misma sesión, decidido por el usuario)
El usuario pidió "un pequeño experimento para tenerlo a mano" → instalación
completa en esta máquina (RTX 5090 Laptop, 24 GB VRAM; no había ni ComfyUI ni
comfy-cli). Eligió modelo frontera: **FLUX.1-dev fp8** (checkpoint todo-en-uno
~17 GB de Comfy-Org en HF, sin login) en vez del SD1.5 por defecto.
- Venv dedicado `C:\Users\tech\comfy-mcp-venv` (Python 3.12): comfy-cli 1.16.0
  + comfy-mcp 0.10.0.
- `claude mcp add comfy --scope user` con `COMFY_BIN` al comfy.exe del venv →
  `✔ Connected` (handshake OK sin ComfyUI corriendo).
- ComfyUI instalado con `comfy install --nvidia` en `C:\Users\tech\comfy`
  (4.4 GB; PyTorch 2.13.0+cu130, CUDA ve la 5090).
- **Gotcha encontrado:** `comfy launch --background` falló con
  `launch_failed` — el proceso hijo re-invoca `comfy` por shell y el Scripts
  del venv no estaba en PATH (el log decía «"comfy" no se reconoce…»). Fix:
  agregar `C:\Users\tech\comfy-mcp-venv\Scripts` al PATH de usuario
  (persistente, vía PowerShell). Con eso el launch levantó ComfyUI en
  `127.0.0.1:8188`.
- `comfy env` confirma: server corriendo, snapshot de hardware correcto,
  Manager detectado, tracking deshabilitado.
- Descarga de `flux1-dev-fp8.safetensors` **completa** (17.2 GB, exit 0, sin
  `.part` residual). **La generación de prueba NO se ejecutó** por instrucción
  del usuario: "cuando termines no lo ejecutes, para hasta ahí". ComfyUI queda
  corriendo en `127.0.0.1:8188`.
### Generación de prueba (retomada por el usuario)
- El template de galería `flux_dev_checkpoint_example` **no sirve** con el
  checkpoint todo-en-uno: sus slots piden UNET/CLIP/VAE sueltos
  (`validate` → 4 errores, `no_options_available`).
- Se escribió el workflow canónico a mano
  (`.tmp/flux_checkpoint_t2i.json`: CheckpointLoaderSimple + FluxGuidance 3.5
  + KSampler cfg=1 euler/simple + EmptySD3LatentImage 1024×1024) →
  `validate: true, 0 errores` → `comfy run --wait`: **completed en 29.2 s**
  (carga del modelo incluida), output
  `C:\Users\tech\comfy\output\flux_mcp_test_00001_.png` (1.6 MB, calidad FLUX).
- Memoria hub registrada: `comfy-stack-instalado-y-el-path-del-venv`
  (qué hay instalado + el gotcha del PATH + el workflow canónico).
### Cambio de modelo: FLUX.1-dev → Qwen-Image 2512 (misma sesión)
Por pedido del usuario ("dale con qwen") se evaluó la frontera open-weights
(FLUX.2 dev/klein, Qwen-Image 2.0, Z-Image Turbo, SD 3.5) para sus 24 GB de
VRAM — ver detalle en la conversación. Se descartó FLUX.1-dev (17.2 GB,
**borrado del disco**) y se instaló **Qwen-Image 2512** (Apache 2.0):
- 4 archivos vía `comfy model download` (~31.6 GB total): diffusion model fp8
  (20.4 GB), text encoder Qwen2.5-VL-7B fp8 (9.4 GB), VAE (254 MB), LoRA
  Lightning 4-steps (1.7 GB) — todos desde `Comfy-Org/Qwen-Image_ComfyUI` y
  `lightx2v/Qwen-Image-2512-Lightning` en HuggingFace (URLs extraídas del
  template `image_qwen_Image_2512` de la propia galería de ComfyUI).
- Workflow escrito a mano (`.tmp/qwen_messi_gol.json`): UNETLoader +
  CLIPLoader(type=qwen_image) + LoraLoaderModelOnly(strength=1.0) + KSampler a
  **solo 4 steps** (la Lightning LoRA permite sampling ultra-rápido).
- **Comparación directa, mismo prompt/escena que con FLUX:** Qwen-Image ganó
  claramente — cara reconocible como Messi (vs. genérica), escudo correcto de
  AFA (vs. híbrido Barça inventado), pelota en el aire en pleno remate (vs.
  pegada al pie), un solo rival coherente (vs. tres equipos mezclados),
  profundidad de campo real. Y más rápido: **21.5 s a 4 steps** vs. 24.2 s a
  20 steps de FLUX.
### Next steps / open questions
- El servidor `comfy` queda registrado en Claude Code (scope usuario): en la
  próxima sesión las 39 tools MCP estarán disponibles de forma nativa —
  probarlas de verdad (server_info, generate vía MCP, elicitation de
  consentimiento).
- ComfyUI quedó corriendo en `127.0.0.1:8188`; se apaga con `comfy stop`.
- **B-001 backlog**: el usuario quiere "seguir con comfy para todo" — Qwen-Image
  2512 + Lightning queda como candidato a motor de imagen por defecto del
  estudio (más rápido y más fiel que FLUX.1-dev en este hardware).
- Abierto: ¿destilar los patrones de diseño MCP de comfy-mcp para el estudio?

### Qwen3-TTS: nodo instalado, pausado esperando audio de referencia
Se profundizó en las capacidades de Qwen3-TTS (4 modos: Custom Voice/Voice
Design/Voice Clone/Fine-Tuning; conceptualmente aclarado que zero-shot clone
≠ fine-tune — el clone de 3s es *conditioning* sobre un modelo ya entrenado,
no ajuste de pesos; el fine-tune real vive en un repo aparte
`Qwen3-TTS-Finetuning` y sí acepta más datos/tiempo; canto es tarea distinta
—audio→audio, no texto→audio— y no es lo que este modelo hace). Tope de
generación verificado: **~3 min por pasada (8192 tokens de audio)**, texto de
entrada máx. 2048 caracteres; para más largo se trocea y concatena.

**Nodo `ComfyUI-Qwen3-TTS` (DarioFT) instalado y verificado:**
- Clonado a `custom_nodes/ComfyUI-Qwen3-TTS`; deps (`qwen-tts`, `modelscope`,
  `soundfile`, `librosa`, `tensorboard`) instaladas en el venv de ComfyUI sin
  tocar el torch+CUDA existente.
- ComfyUI reiniciado; el nodo cargó en 33.3s sin errores fatales — 2 warnings
  no bloqueantes: falta `flash-attn` (solo afecta velocidad) y falta `SoX`
  (utilidad de sistema para audio, revisar si da problemas al testear).
- **10 sub-nodos confirmados vía `comfy nodes search "TTS"`**: Qwen3Loader,
  Qwen3CustomVoice, Qwen3VoiceClone, Qwen3VoiceDesign, Qwen3PromptMaker,
  Qwen3LoadPrompt, Qwen3SavePrompt, Qwen3DataPrep, Qwen3DatasetFromFolder,
  Qwen3FineTune, Qwen3AudioCompare.
- Schema extraído (`nodes show`) para `Qwen3Loader` (repo_id, source, precision,
  attention) y `Qwen3VoiceClone` (model, text, seed, language incl. Spanish,
  ref_audio, ref_text, max_new_tokens, ref_audio_max_seconds tope 120s).
  Grafo listo para escribir: `Qwen3Loader → Qwen3VoiceClone → SaveAudio`.
- Gotcha de comfy-cli: `comfy nodes` usa `search "<query>"` **posicional**, no
  `--query` (error genérico "no such option" si se usa el flag).
- **Pausado por decisión del usuario**: falta el audio de referencia (alguien
  se lo está mandando). Falta también decidir el texto en español a
  sintetizar. Nada corrido todavía con este nodo.

### Continuación: 5 paneles de cómic, `.tmp/` ordenado, Lightning vs calidad completa, Edit
- Llegaron los audios de referencia (`martin bobe compacto.m4a` / `full.m4a`)
  a `.tmp/` — TTS queda pendiente para retomar con ellos.
- **5 paneles de cómic** generados (castor superhéroe radioactivo vs. árboles
  mutantes, estilo 90s) con el mismo prompt de personaje repetido en cada uno
  — `.tmp/imagenes/qwen/comic_castor/`. 7-9s por panel (modelo ya en VRAM).
  Confirmado explícitamente al usuario: **sin IPAdapter ni ninguna referencia
  de imagen** — la única palanca fue repetir el texto; por eso el "castor" a
  veces sale más felino y aparecieron elementos random (hombreras) en un panel.
- **`.tmp/` reorganizado** en subcarpetas: `audio/`, `imagenes/flux/`,
  `imagenes/qwen/` (+ `comic_castor/`), `tts/`; borrados 4 archivos de
  debugging vacíos.
- **Hallazgo técnico en el template oficial de Qwen-Image 2512**: el core es
  un subgrafo con un `ModelSamplingAuraFlow(shift=3.1)` **que no se había
  incluido** en los workflows escritos a mano hasta ahora (Messi, los 5
  paneles) — igual funcionaron, pero no con el sampling "recomendado". Default
  oficial sin Lightning: **50 steps, CFG 4.0** (no lo asumido antes).
- **Comparación Lightning (4 steps) vs. calidad completa (50 steps, con
  ModelSamplingAuraFlow correcto)** sobre panel1_origen: **7-9s vs. 118.75s**
  (16x). Mejora real pero marginal (textura halftone más nítida, más detalle
  de pelaje/aura) — no es la misma pose (semilla igual, pipeline distinto).
  Veredicto: Lightning gana para iterar, calidad completa se justifica solo
  para pieza final única.
- **Descargando Qwen-Image-Edit 2511** (fp8mixed, diffusion model nuevo +
  LoRA Lightning de Edit) para el flujo de consistencia de personaje que pidió
  el usuario: hoja de referencia (T-pose, fondo gris) generada con Qwen-Image
  normal → editada/reusada vía Qwen-Image-Edit para las siguientes escenas.
  Reutiliza el mismo text_encoder y VAE ya instalados (mismo nombre de
  archivo). Nodo clave localizado: `TextEncodeQwenImageEdit(clip, prompt,
  vae, image)` → CONDITIONING que ya "mira" la referencia.
- Explicado al usuario: por qué IPAdapter es más débil que un modelo Edit
  dedicado para consistencia (adapter vs. entrenamiento end-to-end en
  tripletas referencia→instrucción→resultado).
- Gotcha comfy-cli: `comfy nodes search` usa el query **posicional**, no
  `--query`; el subcomando correcto es `nodes show` (no `nodes get`).

### Primera clonación de voz completada (Qwen3-TTS)
- `ffmpeg` **no estaba en el PATH** pero sí instalado (viene con Shutter
  Encoder y TouchDesigner) — se usó directo desde su ruta absoluta, sin
  instalar nada nuevo.
- Recortado clip de referencia: `martin_vega_ref.wav` (15s, 00:02–00:17 del
  audio "compacto" de 6:40 min, indicado por el usuario), mono 24kHz, dejado
  en `ComfyUI/input/`.
- **Gotcha del nodo**: `ref_text` es opcional según el schema de ComfyUI pero
  **obligatorio en la práctica** — `Qwen3VoiceClone` lanza `ValueError` si
  falta junto a `ref_audio` (a menos que se use un `prompt` premade de
  `Qwen3PromptMaker`).
- Transcripción del clip resuelta **sin pedírsela al usuario**: instalado
  `openai-whisper` en el venv de ComfyUI, transcrito con el modelo `small`
  cargando el audio vía `librosa` (bypass del propio `ffmpeg` interno de
  whisper, que también fallaba por PATH). **Gotcha de rutas**: los comandos
  vía Python nativo de Windows necesitan `C:/Users/...`, no el estilo Git Bash
  `/c/Users/...` — este último causó `LibsndfileError: System error` en
  `soundfile`.
- **Workflow**: `Qwen3Loader(repo_id=Qwen3-TTS-12Hz-1.7B-Base, bf16, sdpa) →
  Qwen3VoiceClone(ref_audio, ref_text, language=Spanish) → SaveAudio`.
  Modelo Base descargado automáticamente por el nodo (~3-4 GB, primera vez) a
  `ComfyUI/models/Qwen3-TTS/` (no al caché estándar de HuggingFace).
- **Resultado**: `martin_vega_clone_test_00001.flac` (11.04s, FLAC 24kHz mono,
  19.1s de generación tras tener el modelo cacheado) — copiado a
  `.tmp/tts/`. Texto sintetizado: saludo de prueba mencionando que corre
  local vía Qwen3 TTS en ComfyUI.
- **Sin evaluar por Claude**: no hay forma de "escuchar" el resultado —
  queda a criterio del usuario. Pendiente su veredicto de calidad/parecido.
- **Veredicto del usuario: "bastante decente"** — la clonación funciona.
- Segunda ronda pedida por el usuario: (1) transcripción con timestamps del
  primer minuto del audio "compacto" (para comparar el clon segundo a
  segundo contra la voz real — metodología de benchmark), y (2) un audio más
  largo con una historia nueva (se cayó en la calle y se quebró una pierna),
  reusando la misma referencia de voz.
  - Transcripción con segmentos temporales escrita en
    `.tmp/tts/transcripcion_min1.txt` (16 segmentos, Whisper `small`).
  - Gotcha repetido: al escribir el path a mano se me olvidó la tilde de
    "Investigación" → `FileNotFoundError` silencioso hasta revisar el log.
    Se resolvió pasando a un script `.py` en archivo en vez de `-c` inline.
  - Audio largo (`martin_vega_pierna`) generado con el mismo `ref_audio`/
    `ref_text` de antes, `max_new_tokens=4096` por el texto más largo:
    21.92s, 38.1s de generación.
  - **Veredicto final del usuario: "bastante bien, para haber montado un
    clon con 15 segundos de audio"**. Qwen3-TTS zero-shot clone queda
    validado como viable para este caso de uso.
  - **Loop de benchmark ejecutado**: los 16 segmentos de `transcripcion_min1.txt`
    sintetizados con el clon (mismo `ref_audio`/`ref_text`, seed=42) y
    emparejados con su recorte real correspondiente en
    `.tmp/tts/benchmark/` (`segNN_real.wav` + `segNN_clon.flac` +
    `manifest.txt`). 16/16 generados sin error, 2.8–9.5s cada uno.
  - `.tmp/` limpiado de ~20 archivos de debugging/exploración (logs de
    `validate`/`run`, dumps de schema de nodos, JSONs de templates crudos) —
    quedaron solo resultados, workflows reusables y scripts.
  - **Audio largo de cierre** ("Firulais", 2 min con arco emocional:
    silencio/duelo → recuerdo cálido/humor → gratitud): 78.8s en la v1
    (263 palabras, ritmo natural más rápido de lo estimado — ~200 ppm, no
    ~140). **Investigado control de ritmo/emoción**: confirmado que
    `Qwen3VoiceClone` y `Qwen3PromptMaker` **no tienen parámetro de
    velocidad**; el control por instrucción emocional (`instruct=`) solo
    existe en `Qwen3CustomVoice`, que usa las 9 voces preestablecidas — no
    compatible con voz clonada. Reescrito el guión (v2) con elipsis, frases
    cortas y quiebres de línea para forzar pausas vía puntuación → **81.68s,
    apenas +3s sobre la v1**. **Corrección de criterio**: la duración total
    fue un mal proxy — el usuario escuchó ambas y su veredicto es que **la
    v2 suena mejor** (más pausada y emocional al oído), aunque la duración
    casi no cambió. La puntuación sí parece ser una palanca real para
    **dónde caen las pausas y la modulación**, no necesariamente para
    estirar la duración total — son ejes distintos. Se deja la v2
    (`martin_vega_perrito_v2_00001.flac`) como la versión válida del cierre.
    Post-proceso con `ffmpeg atempo` sigue disponible si se quiere ir más
    lento todavía, pero no fue necesario — el usuario decidió dejarlo así.

### Flujo de consistencia con Qwen-Image-Edit: resuelto vía exploración paralela del usuario
- Mientras se trabajaba en TTS, el usuario exploró **directo en la UI web de
  ComfyUI** (`127.0.0.1:8188`) por su cuenta: varios diseños de personaje
  (elefante explorador, estilo SpongeBob, un pulpo/estrella en pixel-art
  C64) y, clave, **"Bruni"** — un pólipo de coral morado con gorro de
  estrella de mar y bufanda amarilla, en hoja de referencia (fondo gris,
  pose abierta) — más una prueba de edición sobre esa referencia.
- **Hallazgo crítico**: el workflow que el usuario guardó
  (`personaje_spinoff_edit_surf.json`) revela el cableado REAL de
  Qwen-Image-Edit que no se había logrado reconstruir antes desde el
  subgrafo del template oficial:
  `UNETLoader(qwen_image_edit_2511) → LoraLoaderModelOnly(Edit Lightning) →
  ModelSamplingAuraFlow(shift=3.0) → CFGNorm(strength=1.0, pre_cfg=false) →
  KSampler`. Positivo y negativo van por `TextEncodeQwenImageEdit(clip,
  prompt, vae, image)` (el negativo con `prompt=""`, mismo `image`). El
  **latente inicial NO es `EmptyLatentImage`** — es `VAEEncode` de la
  imagen de referencia misma, con `denoise=1.0`. `CFGNorm` es un nodo que
  no se había explorado antes. `cfg=2.5, steps=20` (no el combo Lightning
  4-steps/cfg=1, pese a tener la LoRA cargada).
- `.tmp/imagenes/qwen/` reorganizado: `exploracion_ui/` (los descartes y
  pruebas del usuario, renombrados descriptivamente) +
  `consistencia_edit/` (el experimento propio, con `bruni_referencia.png`
  como ancla).
- Reusando ese grafo exacto: generadas dos escenas nuevas de Bruni
  (`bruni_surf.json` — surfeando en la playa; `bruni_lectura.json` — leyendo
  junto al fuego) para probar consistencia real de personaje vía Edit,
  en contraste directo con el experimento del castor (solo texto repetido,
  sin referencia, con inconsistencias notorias entre paneles).
- **Ambas fallaron mal**: `bruni_surf` colapsó en un collage roto de 9
  fragmentos en grilla, sin nada reconocible; `bruni_lectura` mantuvo colores
  pero cambió la expresión facial y **duplicó al personaje**. El usuario pidió
  investigar en serio en vez de seguir adivinando parámetros.
- **Causa raíz encontrada** vía `docs.comfy.org/tutorials/image/qwen/qwen-image-edit`
  + comparación directa contra los templates oficiales ya descargados
  (`edit_2511_template.json` vs `edit_base_template.json` en
  `exploracion_ui/`): **desajuste de versión de nodo**. El modelo instalado
  es `qwen_image_edit_2511_fp8mixed.safetensors` (2511, multi-referencia),
  que exige `TextEncodeQwenImageEditPlus` (input `image1`, hasta 3 refs) —
  se estaba usando `TextEncodeQwenImageEdit` (el nodo del modelo *base*,
  no-2511). Además faltaban dos nodos completos del grafo oficial:
  `FluxKontextImageScale` (preescala la imagen a la resolución "óptima para
  Kontext" — 1024×1024 ya está en ~1MP pero **no es lo mismo** que el bucket
  óptimo de Kontext) y `FluxKontextMultiReferenceLatentMethod`
  (`reference_latents_method="index_timestep_zero"`, aplicado a positivo Y
  negativo entre el conditioning y el KSampler — sin él, la referencia
  multi-imagen del 2511 no se empaqueta bien para el sampler, lo que explica
  el colapso en grilla). Defaults oficiales sin Lightning: **steps=40, cfg=3,
  shift=3.1** (no 2.5/20 que se había copiado del test del usuario, que
  además tenía la LoRA Lightning cargada pero **nunca conectada** — nodo
  huérfano en su propio JSON).
- Reescrito `bruni_surf_v2.json` con el grafo completo y correcto.
  **Resultado: ÉXITO total.** Bruni queda 100% reconocible — mismo gorro de
  estrella, misma forma, mismos ojos, misma bufanda amarilla, mismos brazos —
  surfeando en una ola con palmeras al fondo, con una expresión nueva y
  coherente (guiño, sonrisa) que la escena pide. **Corrección de la
  conclusión anterior**: el fallo NO era una limitación real de
  Qwen-Image-Edit ante cambios grandes de pose/escena — era enteramente el
  bug del grafo (nodo de encode equivocado + faltaban dos nodos). Con el
  grafo correcto, Edit sí sostiene identidad fuerte incluso ante
  reescenificación completa.
  Replicado el mismo fix en `bruni_lectura_v2.json` (Bruni leyendo junto al
  fuego): **segundo éxito total**, idéntica identidad, cero duplicación,
  composición coherente. Dos de dos — el fix queda confirmado y reproducible.
  **Grafo canónico de Qwen-Image-Edit 2511 en ComfyUI**, validado dos veces:
  `LoadImage → FluxKontextImageScale → [TextEncodeQwenImageEditPlus(prompt,
  image1) ×2 (pos/neg) → FluxKontextMultiReferenceLatentMethod
  (index_timestep_zero) ×2] + VAEEncode(imagen escalada) →
  KSampler(steps=40, cfg=3, denoise=1.0) sobre
  ModelSamplingAuraFlow(shift=3.1)→CFGNorm(strength=1, pre_cfg=false)`.
  Sin la Lightning LoRA (no se necesitó para estos dos casos; queda como
  siguiente prueba de velocidad, ahora que la calidad está resuelta).

### Comparación de rendimiento: Edit sin vs. con Lightning bien cableada
Se recuperaron los tiempos reales de los 4 jobs (v1 roto y v2 correcto) desde
los `state_file` de comfy-cli (`submitted_at`→`completed_at`, ya que los logs
de texto se habían borrado en la limpieza): v1 (roto, 20 steps, LoRA cargada
pero **huérfana** — nunca conectada, mismo error que tenía el JSON del propio
usuario) tomó 126-128s; v2 (correcto, 40 steps, sin LoRA) tomó 216-217s — la
proporción calza con el doble de steps.
- Se rehízo `bruni_surf_lightning.json`: mismo grafo v2 correcto +
  `LoraLoaderModelOnly` (Edit Lightning) **esta vez sí conectada**
  (`CFGNorm → LoraLoaderModelOnly → KSampler`), `steps=4, cfg=1` (defaults
  oficiales del modo Lightning en el template). **Resultado: 28.35s** (medido
  con `elapsed_seconds`, incluye recarga del modelo) — **~7.6x más rápido**
  que los 216s sin LoRA, **con la misma fidelidad de personaje** (quizás
  incluso más ceñida al estilo de línea de la referencia; la pose salió algo
  más estática/erguida que la versión de 40 steps, que fue más dinámica).
- **Conclusión**: la Lightning LoRA de Edit funciona tan bien como la de
  T2I — el "costo" de la consistencia real vía Edit no tiene por qué ser
  lento. La receta rápida (4 steps/cfg=1) queda como la recomendada por
  defecto para este flujo; los 40 steps solo se justifican si se busca más
  dinamismo de pose.
- Además, se generó una foto hyperrealista de prueba fuera del hilo de Bruni
  (fotoperiodista de guerra, T2I con Qwen-Image 2512 + Lightning, grafo
  completo con `ModelSamplingAuraFlow` esta vez incluido) — resultado sólido:
  piel/luz muy convincentes, la cámara (objeto mecánico) es donde se nota
  la costura de IA (lente deformado, texto de marca ilegible) — mismo patrón
  de fortalezas/debilidades visto toda la sesión.

### Los workflows validados, promovidos a execution/comfy_workflows/
El usuario pidió no tener que regenerar los grafos cada vez — decidió (vía
pregunta) llevarlos a `execution/` en la raíz del hub (compartido entre
investigaciones, Capa 3 del modelo de 3 capas), no dejarlos acotados a esta
investigación, coherente con B-001.
- **5 plantillas** en formato API (el que consume `run_workflow`), con
  contenido placeholder/genérico en vez del específico de hoy (Bruni,
  Martín): `t2i_qwen_lightning.json`, `t2i_qwen_full_quality.json`,
  `edit_qwen_lightning.json` (la receta ganadora: ~28s, consistencia
  completa), `edit_qwen_full_quality.json`, `tts_voice_clone.json`.
- **`README.md`** documentando, por plantilla: qué hace, cuándo usarla,
  tiempo esperado, y la clave JSON exacta (nodo→campo) a cambiar — no
  `set_workflow_slot`, porque esa tool de comfy-mcp exige formato *frontend*
  (`nodes[]`/`links[]`), y estos archivos están en formato *API* (lo que
  corre `run_workflow`). Gotcha documentado explícitamente en el README.
- Las 5 validan contra el install vivo (`comfy validate`); prueba de humo
  real corrida desde `execution/comfy_workflows/` (no solo validación,
  ejecución completa) confirmando que funcionan desde la nueva ubicación.
- Memoria hub nueva: `workflows-comfy-reusables-en-execution` (apunta al
  README, para que cualquier investigación futura las encuentre sin releer
  esta bitácora).
- **Reubicación final**: a pedido del usuario, movidas de `execution/` (raíz
  del repo, compartido entre investigaciones pero igual dentro de un repo
  git) a `C:\Users\tech\comfy-workflows\` — **fuera de cualquier repo**, para
  que sean tan universales como el servidor MCP `comfy` mismo (registrado a
  nivel de usuario en Claude Code, no de proyecto). Prueba de humo repetida
  desde la nueva ruta: funciona. Memoria hub y README actualizados con la
  ubicación final. `execution/` queda de nuevo solo con su `.gitkeep`.

### Cierre de sesión
Sesión larga y densa (única entrada de hoy). Resumen de lo que queda
funcionando y disponible para cualquier sesión futura:
- Stack completo instalado: comfy-cli + comfy-mcp + ComfyUI (RTX 5090,
  24GB) + Qwen-Image 2512 + Qwen-Image-Edit 2511 + Qwen3-TTS 1.7B, todos con
  sus LoRAs Lightning.
- Servidor `comfy` registrado en Claude Code (scope usuario) — las 39 tools
  MCP nativas quedan disponibles desde la próxima sesión (esta sesión las
  usó siempre vía comfy-cli directo, nunca se probaron nativas).
- 5 workflows canónicos validados en `C:\Users\tech\comfy-workflows\`
  (README con la clave JSON exacta de cada parámetro).
- Backlog abierto: B-001 (adoptar Comfy como motor del estudio — de facto
  ya en curso), B-002 (registrar el MCP en otros clientes), B-003 (fine-tune
  real de voz con el audio completo de 37 min).
- Nada commiteado en el repo todavía — pendiente si el usuario quiere un
  checkpoint de git.
- La pregunta de fondo quedó respondida de facto: **usarlo** (está conectado a
  Claude Code, scope usuario). Queda abierto si además se le roban patrones de
  diseño MCP para el estudio.
