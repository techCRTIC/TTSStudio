# TTS Studio

App local para generar voz clonada a partir de texto. Corre entera en tu
máquina: motor **Qwen3-TTS 1.7B** sobre **ComfyUI**, sin APIs de pago y sin que
la voz salga del equipo.

Escribes un texto, eliges una voz, y obtienes audio. Alrededor de eso vive lo
que hace usable el flujo: biblioteca de voces, guiones largos, historial y
exportación.

> **Es una herramienta personal de un solo usuario.** No hay multiusuario, ni
> autenticación, ni despliegue. Está publicada porque el código y las decisiones
> pueden servirle a alguien, no porque sea un producto instalable.

Qué es y para quién → [`PRODUCT.md`](PRODUCT.md) · a dónde va →
[`directives/roadmap.md`](directives/roadmap.md) · por qué está hecho así →
[`directives/architecture/`](directives/architecture/)

---

## Qué hace hoy

- **Genera voz** desde texto con una voz clonada, mostrando el estado real del
  motor — nunca una ruedita indeterminada ni un porcentaje inventado.
- **Biblioteca de voces.** Alta desde un audio de referencia o desde el
  micrófono, transcripción propia corregible, escucha sin gastar una toma,
  borrado real del disco, y **procedencia visible**: de quién es cada voz y con
  qué permiso ([ADR-005](directives/architecture/ADR-005-voice-provenance-sidecar.md)).
- **Guiones largos.** Por encima de 1.600 caracteres el texto se trocea por
  frases completas, te enseña los cortes para que los confirmes, genera tramo a
  tramo, **detecta el bug de bucle** del motor comparando duración con
  caracteres y rehace ese tramo con otra semilla, iguala el volumen entre tramos
  y lo une todo en una sola toma. Se puede detener a media corrida: para entre
  tramos y conserva lo hecho.
- **Escritura asistida.** Un botón revisa ortografía y ritmo con reglas medidas
  y propone una versión escrita para ser leída en voz alta, marcando qué
  cambió. Lo determinista lo hacen scripts de Python; el modelo local solo hace
  lo que es criterio ([ADR-006](directives/architecture/ADR-006-local-language-model-for-text.md)).
- **Historial persistente** de todas las generaciones.
- **Portal de configuración.** Al arrancar comprueba qué falta y, si falta algo
  que impide generar, lo explica en una pantalla y lo instala.

**Salud:** 210 tests de la app (2 se saltan solos si ComfyUI está apagado), 32
de Python, y cuatro verificadores de costura (`execution/check_*.py`) que
comprueban los contratos que ningún analizador ve enteros.

---

## Qué necesitas tener instalado

**La app se audita sola al arrancar.** Si falta algo imprescindible abre un
portal que lo explica y **descarga e instala lo que se puede instalar sin
riesgo**: los modelos, las dependencias del pack de nodos (con el intérprete
propio de ComfyUI, que es el paso que siempre falla a mano) y el modelo de
ollama. De **ComfyUI y comfy-cli solo te guía** — la app no se hace dueña de un
proyecto ajeno que no versiona. Ver
[ADR-008](directives/architecture/ADR-008-setup-portal.md).

Una dependencia se marca resuelta **solo cuando una auditoría nueva la ve**,
nunca porque el instalador dijera que fue bien.

| | |
|---|---|
| **ComfyUI** | corriendo en `127.0.0.1:8188` |
| **Pack de nodos** | `ComfyUI-Qwen3-TTS` — ojo: **sus dependencias no se instalan solas**, hay que correr su `requirements.txt` con el Python del venv de ComfyUI y reiniciar |
| **Checkpoint del motor** | `Qwen3-TTS-12Hz-1.7B-Base` (~4,3 GB) |
| **Al menos una voz** | un `.safetensors` en `models/Qwen3-TTS/prompts/` |
| **Opcional — voces preestablecidas** | `Qwen3-TTS-12Hz-1.7B-CustomVoice` (~4 GB, descarga distinta). Sin él la app simplemente no las ofrece, a propósito |
| **Opcional — botón de reescritura** | [ollama](https://ollama.com) con `qwen3:4b` |

La lista de voces no es una tabla que la app mantenga: es lo que ComfyUI reporta
en el combo del nodo `Qwen3LoadPrompt`, así que no puede desincronizarse de lo
que hay en disco.

---

## Cómo correrlo

```bash
npm start
```

Desde la raíz del proyecto. Eso es todo. El lanzador (`scripts/start.mjs`) hace,
en orden:

1. **Comprueba ComfyUI.** Si no responde, lo levanta y espera hasta que esté
   (hasta 2 minutos: un arranque en frío carga todos los nodos). Si no encuentra
   el ejecutable, avisa y sigue — la app abrirá, pero no podrá generar.
2. **Libera el puerto.** Si quedó un TTS Studio de una ejecución anterior, lo
   cierra. **Solo si es el nuestro**: comprueba que lo que contesta en el puerto
   es esta app antes de matar nada. Cualquier otra cosa la reporta y se detiene.
3. **Compila** y arranca.
4. **Abre el navegador** cuando la app responde de verdad, no antes.
5. **Vigila el motor** mientras corre: lo consulta cada 15 s y lo relanza si se
   cayó, **hasta tres veces**. Se para ahí a propósito — revivir en bucle algo
   que el sistema mata por falta de memoria empeora el problema.

`Ctrl+C` cierra el servidor de verdad, sin dejar el proceso huérfano.

> `npm start` sirve una versión **compilada**: un cambio de código no se ve
> hasta reiniciar el lanzador. Para iterar, usa `npm run dev`.

### Los otros comandos

```bash
npm run dev      # desarrollo con recarga en caliente (también comprueba ComfyUI)
npm test         # 210 tests; 2 se saltan solos si el motor está apagado
npm run build    # solo compilar
npm run lint
```

Ajustes por variable de entorno: `PORT=3001 npm start` · `COMFY_URL=… npm start`
· `COMFY_BIN=… npm start`

Uno de los tests afirma que ComfyUI **sigue** rechazando peticiones con `Origin`
ajeno: si eso alguna vez cambia, el test se cae y avisa de que el
[ADR-001](directives/architecture/ADR-001-comfyui-bridge.md) quedó obsoleto.

---

## Dónde quedan los audios generados

En la carpeta de salida de **ComfyUI**, no dentro del proyecto:

```
<tu-carpeta-de-comfy>/output/ttsstudio_00001.flac
```

Formato **FLAC**, numerados correlativos, con el prefijo `ttsstudio`. La app
**no los copia**: los referencia por URL a través de su proxy
(`/api/comfy/view?filename=…`), porque duplicarlos sería gastar el doble de
disco sin ganar nada.

Dos consecuencias que conviene tener presentes:

- El botón **Descargar** te deja una copia donde tú quieras. Esa sí es tuya y no
  depende de ComfyUI.
- El **historial** guarda el texto y un enlace, no el audio. Si vacías la
  carpeta de salida de ComfyUI, las tomas viejas quedan en la lista pero ya no
  suenan.

---

## Sobre clonar la voz de una persona

Este proyecto clona voces a partir de una muestra corta. Eso es un dato
biométrico, y la herramienta no puede juzgar de quién es ni con qué permiso, así
que esa responsabilidad es enteramente de quien la usa.

La app trata el consentimiento como un dato de primera clase, no como un
comentario: cada voz guarda un archivo de procedencia a su lado, y ahí es donde
vive **de quién es esa voz y con qué permiso**
([ADR-005](directives/architecture/ADR-005-voice-provenance-sidecar.md)). Una
voz sin ese archivo se muestra como *«sin procedencia registrada»* en vez de
fingir que da igual.

Si vas a clonar la voz de alguien, pídele permiso. Si vas a publicar el
resultado, dilo.

---

## Cuando algo falla

**La barra superior dice «ComfyUI no responde»** — el motor no está corriendo, o
está en otro puerto. La app apunta a `127.0.0.1:8188` salvo que definas
`COMFY_URL`. Truco de diagnóstico: si el error vuelve en milisegundos, no hay
nadie al otro lado; si tarda segundos, el motor está vivo pero atascado.

**El puerto 3000 ocupado** — `npm start` lo resuelve solo si el ocupante es un
TTS Studio anterior. Si es otro programa, se detiene y te lo dice.

**«Sin voces» en el selector** — no hay ningún `.safetensors` en
`models/Qwen3-TTS/prompts/`.

**Las voces preestablecidas no aparecen** — falta el checkpoint `-CustomVoice`.
La app las oculta a propósito en vez de ofrecerlas y fallar al generar.

**El botón de reescribir no responde** — falta ollama con `qwen3:4b`.

---

## Cómo está armado

El navegador **nunca** habla con ComfyUI directamente: ComfyUI responde 403 a
cualquier petición que traiga un `Origin` ajeno, así que todas las llamadas al
motor salen del servidor de Next, que quita esa cabecera. Está medido y razonado
en el [ADR-001](directives/architecture/ADR-001-comfyui-bridge.md), y es la razón
de que esto no pueda ser un frontend estático.

```
web/src/app/page.tsx          la pantalla: escenario central + cajones laterales
web/src/components/           campo de audio, onda, tira de tramos, biblioteca…
web/src/lib/comfy.ts          el saneador de cabeceras del ADR-001
web/src/lib/tts.ts            grafo Qwen3, envío y lectura de estado
web/src/lib/long-script.ts    orquestación de tramos (ADR-007)
web/src/app/api/              voices · generate · status · segments · text · proxy
execution/                    scripts deterministas en Python (troceo, unión, QA)
execution/check_*.py          verificadores de costura
directives/architecture/      los ADRs: por qué cada decisión es como es
```

**Stack:** Next.js 16.3.1 · React 19 · Tailwind 4 · Geist · TypeScript. La mitad
determinista es Python de biblioteca estándar, con su propio arnés de `pytest`.

---

## Licencia

El código de este repositorio es **MIT** — ver [`LICENSE`](LICENSE).

**Eso cubre el código, y nada más.** Tres cosas quedan fuera y conviene saberlo:

- **Los modelos.** No viajan en el repositorio, se descargan aparte, y traen sus
  propios términos. **Qwen3-TTS** tiene los suyos; conviene leerlos antes de
  darle un uso comercial.
- **ComfyUI y comfy-cli son GPL-3.0**, pero su copyleft no alcanza a este
  código: la app no los incorpora, los **invoca como programas separados** —
  uno por HTTP, el otro como subproceso— y no los redistribuye.
- **Eso cambiaría** el día que alguien empaquete un instalador que lleve ComfyUI
  dentro. Ahí sí se estaría distribuyendo software GPL, con las obligaciones que
  eso trae.
