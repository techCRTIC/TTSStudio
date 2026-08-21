# Active Session State

<!-- cierre -->
## 🧾 Cierre — Sesión 2 en curso · 2026-08-21
El resumen completo de cada sesión vive en `directives/session-log.md`, y es lo
que la próxima sesión lee primero. Este archivo es el detalle recuperable.
<!-- /cierre -->

---

**Status:** sesión 2 en curso. Fase 2 completa salvo la procedencia de las
voces, más opciones avanzadas y borrado real. Falta mirarlo en un navegador.
**Last update:** 2026-08-21

## Current task
**Fase 2 — biblioteca de voces.** Dar de alta voces nuevas desde un audio de
referencia.

### Lo que ya está hecho y verificado
- **`execution/transcribe_audio.py`** — transcribe el audio de referencia.
  Medido contra los clips reales de Andrés: 16 s para un clip de 10,6 s, 27 s
  para uno de 30 s. Determinista (dos corridas, texto idéntico).
- **`web/src/lib/transcribe.ts`** — lanza ese script desde el servidor.
- **`web/src/lib/voices.ts`** — subida del audio a ComfyUI + el grafo
  `LoadAudio → Qwen3PromptMaker → Qwen3SavePrompt` + el saneado del nombre.
- **`POST /api/voices/transcribe`** — paso 1: sube y devuelve el borrador de
  transcripción.
- **`POST /api/voices`** — paso 2: crea la voz con la transcripción ya corregida.
- **`execution/check_trim_contract.py`** — el verificador de la costura.
- **`web/src/components/VoiceLibrary.tsx`** — la pantalla: cajón en el borde
  izquierdo, gemelo del de «Tomas». Subir → escuchar → corregir → nombrar → crear.
- **Probado de principio a fin contra ComfyUI corriendo:** creó
  `voz_de_prueba.safetensors` y apareció sola en el selector.
- **`web/src/components/AdvancedPanel.tsx`** — semilla (fijar / tirar de nuevo /
  guardar con nombre), idioma y techo de longitud. Los tres únicos parámetros
  que el motor acepta, verificados en su código.
- **`web/src/lib/favorites.ts`** — semillas guardadas con nombre, en el navegador.
- **`web/src/lib/comfy-files.ts` + `/api/takes`** — borrado real de archivos del
  disco de ComfyUI (ADR-004). Único módulo que toca `node:fs`.
- **`execution/check_engine_options.py`** — segundo verificador de costura.
- **`web/src/components/VoiceRecorder.tsx` + `lib/recording.ts`** — grabar la
  voz desde el micrófono, con guión en pantalla para leer. Convierte a WAV en
  el navegador para no depender del formato de cada navegador.
- 60 tests en verde (ninguno saltado), tipos, lint y compilación limpios,
  ambos verificadores de costura en verde, detector de diseño sin hallazgos.

### Lo que falta para cerrar la Fase 2
1. **Mirarlo en un navegador.** Es lo único que juzga el acabado, y nadie lo ha
   hecho: ni la biblioteca de voces, ni las opciones avanzadas, ni los dos
   borrados. La app del usuario corre un build anterior: hay que reiniciarla.
2. **Procedencia visible** de cada voz — son personas identificables. Está en el
   roadmap de la Fase 2 y sigue sin hacerse. Escuchar una voz sin generar
   tampoco existe.
3. Quedó `voz_de_prueba.safetensors` de la validación. Ya **se puede borrar
   desde la interfaz**: el usuario eligió esa vía en lugar de borrarla por
   detrás.

## ⚠️ Para continuar hay que reiniciar la app
El servidor lo levanta **el usuario, en su terminal** — una tarea de fondo de un
agente muere al terminar el turno. Ver
[[agent-background-server-dies-with-turn]]. Y `npm start` compila al arrancar,
así que **un cambio de código no se ve hasta reiniciarlo**.

```
npm start        # desde la RAÍZ
```

## Decisiones de esta sesión
- **ADR-003: la transcripción se hace en la app, no dentro de ComfyUI.** El
  motor exige el texto del audio de referencia (`ref_text`) y no hay ningún ASR
  instalado. Se usa `faster-whisper` (sin PyTorch) desde un script de
  `execution/`, en vez de instalar un pack de terceros en el motor.
- **El usuario corrige la transcripción antes de crear la voz.** No es un
  adorno: en la prueba real, Whisper convirtió *"Andrés"* en *"Andrea"* — el
  nombre del propio hablante — en el clip corto. Sin ese paso, la voz se habría
  calculado contra un texto que nombra a otra persona.
- **El usuario descartó escribir la transcripción a mano** cuando se le
  presentaron las tres opciones. De ahí viene todo lo anterior.

## Reglas nuevas que no se deben deshacer
- **El contrato del recorte.** `REF_AUDIO_MAX_SECONDS` (en `voices.ts`) y el
  `--max-seconds` del script Python **tienen que ser el mismo número**. Si se
  separan, la transcripción describe audio que el modelo no escuchó y la voz
  sale peor **sin que nada falle**. Lo vigila `execution/check_trim_contract.py`.
- **`voiceSlug` es seguridad, no cosmética.** `Qwen3SavePrompt` construye su
  ruta sin sanear nada, así que un nombre con `..` escribiría fuera del
  directorio de voces. Los tests de traversal existen por eso.
- **`maxDuration` de Next no limita nada en local** (sus propios docs: "set by
  deployment platform"). El límite real es el del proceso, en `transcribe.ts`.
  Guardado como memoria: [[nextjs-maxduration-does-nothing-locally]].
- **Un grafo que guarda un archivo termina SIN audio**, y eso es normal. El
  estado `finished` existe por eso. Esperar `done` en un alta de voz es esperar
  para siempre — fue un bug real, medido contra el motor.
- **Los imports locales llevan `.ts` explícito.** El runner de tests no resuelve
  sin extensión; `tsconfig` ya tiene `allowImportingTsExtensions`.
- **`Number(null)` es `0`, no `NaN`.** Un valor ausente hay que detectarlo
  ANTES de convertirlo, o «no me mandaron nada» se convierte en «cero» y el
  clamp lo acepta encantado. Fue un bug real que cazó un test.
- **No hay ni un solo control nativo del sistema en la interfaz.** Ni
  `<select>`, ni `type="number"` (sus flechitas también son chrome del
  navegador). Todo desplegable pasa por `components/Select.tsx`, que es el
  listbox accesible del proyecto, uno solo y compartido.
- **El audio de referencia se borra al crear la voz.** Es la grabación de una
  persona y deja de tener función en cuanto existe la huella. La interfaz lo
  dice; borrar del disco no puede ser una sorpresa.
- **No se usan `window.prompt` ni `window.confirm`.** Este proyecto reemplazó el
  desplegable nativo justo para no traer chrome del sistema; un diálogo del
  navegador es lo mismo pero peor. Se pregunta dentro de la propia pantalla.
- **El runner de tests borra tipos, no los compila.** Nada de *parameter
  properties* de TypeScript (`constructor(private x: T)`) en código que un test
  vaya a importar: el campo queda sin definir en tiempo de ejecución.
- **La app solo ofrece los parámetros que el motor declara.** Hoy son tres:
  semilla, idioma y techo de longitud. Lo vigila
  `execution/check_engine_options.py`.

## Documentación actualizada en esta sesión
- `directives/architecture/ADR-003-transcription-outside-comfyui.md` — nuevo,
  con la tabla de mediciones reales al final.
- `directives/session-log.md` — entrada de la sesión 2 arriba del todo.
- `directives/backlog.md` — B-006 ampliado con la descarga de 2,9 GB.
- `memory/nextjs-maxduration-does-nothing-locally.md` — nuevo, e indexado en
  `memory/MEMORY.md`.

## Cómo levantarlo
```
npm start        # desde la RAÍZ. Un solo comando.
uv sync          # si el entorno de Python no existe
```
Detalle y modos de fallo → `README.md`.

## Dónde están las cosas
| Ruta | Qué es |
|---|---|
| `web/src/app/page.tsx` | El escenario: plegado → desplegado, con la bandeja |
| `web/src/components/ScriptField.tsx` | Área de escritura que crece + desvanecidos |
| `web/src/components/AudioField.tsx` | Campo de audio animado de fondo |
| `web/src/components/Waveform.tsx` | Onda decodificada del audio real + transporte |
| `web/src/components/VoiceSelect.tsx` | Selector de voz propio (listbox accesible) |
| `web/src/components/StatusLine.tsx` | Estado del motor, con ancho que transforma |
| `web/src/lib/comfy.ts` | El saneador de cabeceras del ADR-001 |
| `web/src/lib/tts.ts` | Grafo Qwen3 de generación, envío y lectura de estado |
| `web/src/lib/voices.ts` | **Nuevo.** Alta de voces: subida, grafo y saneado |
| `web/src/lib/transcribe.ts` | **Nuevo.** Puente al script de transcripción |
| `web/src/components/VoiceLibrary.tsx` | **Nuevo.** Cajón izquierdo: voces, alta y borrado |
| `web/src/components/AdvancedPanel.tsx` | **Nuevo.** Semilla, idioma, techo |
| `web/src/lib/favorites.ts` | **Nuevo.** Semillas guardadas con nombre |
| `web/src/lib/comfy-files.ts` | **Nuevo.** Borrado en el disco de ComfyUI |
| `web/src/components/VoiceRecorder.tsx` | **Nuevo.** Grabar con micrófono + guión |
| `web/src/lib/recording.ts` | **Nuevo.** Los guiones y el codificador WAV |
| `web/src/components/Select.tsx` | **Nuevo.** El único desplegable del proyecto |
| `web/src/lib/history.ts` | Historial en localStorage vía store externo |
| `execution/transcribe_audio.py` | **Nuevo.** La transcripción (Layer 3) |
| `execution/check_trim_contract.py` | **Nuevo.** El verificador de la costura |
| `scripts/start.mjs` | El lanzador de `npm start` |
| `directives/architecture/` | ADR-001 (puente), ADR-002 (stack), ADR-003 (ASR), ADR-004 (borrado) |

## Abierto / sin verificar
- **Nadie ha visto nada de lo nuevo en un navegador.** Todo lo verificado es
  automático: tests, tipos, compilación y el detector de diseño. Ninguno de esos
  juzga cómo se ve.
- **Sin medir: si una semilla transfiere carácter entre textos distintos.** Es
  lo que decide cuánto valen las semillas guardadas, y solo se juzga
  escuchando. Anotado como B-009.
- **B-008:** el hook de secretos tiene un falso positivo con código JavaScript.
  No se tocó porque `.claude/hooks/` requiere permiso explícito.
- **`npm start` no sabe nada del entorno de Python.** Si `.venv/` no existe, el
  alta de voz falla con un mensaje claro, pero el lanzador no lo comprueba ni lo
  crea. Encaja con B-006.
- **Ventanas angostas:** sigue sin verificar desde la sesión 1.
- **B-007:** la revisión de acabado y el `DESIGN.md` del spinoff siguen sin
  hacerse.
- Los tres bocetos de dirección siguen en `.tmp/sketches/`, territorio de purga.
