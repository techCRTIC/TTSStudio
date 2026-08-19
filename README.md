# TTS Studio

App local para generar voz clonada a partir de texto. Corre entera en esta
máquina: motor **Qwen3-TTS 1.7B** sobre **ComfyUI**, sin APIs de pago y sin que
la voz salga del equipo.

Qué es y para quién → [`PRODUCT.md`](PRODUCT.md) · a dónde va →
[`directives/roadmap.md`](directives/roadmap.md) · por qué está hecho así →
[`directives/architecture/`](directives/architecture/)

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

`Ctrl+C` cierra el servidor de verdad, sin dejar el proceso huérfano que antes
se quedaba con el puerto.

Otro puerto: `PORT=3001 npm start` · otro ComfyUI: `COMFY_URL=... npm start` ·
comfy en otra ruta: `COMFY_BIN=... npm start`

### Los otros comandos

```bash
npm run dev      # desarrollo con recarga en caliente (no arranca ComfyUI)
npm test         # 7 tests, 2 de ellos contra el ComfyUI real
npm run build    # solo compilar
```

Uno de los tests afirma que ComfyUI **sigue** rechazando peticiones con `Origin`
ajeno: si eso alguna vez cambia, el test se cae y avisa de que el
[ADR-001](directives/architecture/ADR-001-comfyui-bridge.md) quedó obsoleto.

---

## Dónde quedan los audios generados

En la carpeta de salida de **ComfyUI**, no dentro del proyecto:

```
C:\Users\tech\comfy\output\ttsstudio_00001.flac
```

Formato **FLAC**, numerados correlativos, con el prefijo `ttsstudio`. La app
**no los copia**: los referencia por URL a través de su proxy
(`/api/comfy/view?filename=…`), porque duplicarlos sería gastar el doble de
disco sin ganar nada.

Dos consecuencias que conviene tener presentes:

- El botón **Descargar** de la app te deja una copia donde tú quieras. Esa sí es
  tuya y no depende de ComfyUI.
- El **historial** de la bandeja guarda el texto y un enlace, no el audio. Si
  vacías la carpeta de salida de ComfyUI, las tomas viejas quedan en la lista
  pero ya no suenan.

---

## Qué necesita estar en su sitio

| | |
|---|---|
| ComfyUI | corriendo en `127.0.0.1:8188` |
| Pack de nodos | `comfyui-qwen3-tts` instalado |
| Al menos una voz | un `.safetensors` en `models/Qwen3-TTS/prompts/` |

La app **no instala nada de esto todavía** — verificar dependencias y guiar la
instalación es el pendiente B-006 del backlog.

La lista de voces no es una tabla que la app mantenga: es lo que ComfyUI reporta
en el combo del nodo `Qwen3LoadPrompt`, así que no puede desincronizarse de lo
que hay en disco. Para añadir una voz hoy hay que calcularla en ComfyUI; hacerlo
desde la app es la Fase 2.

---

## Cuando algo falla

**El puerto 3000 ocupado** — `npm start` lo resuelve solo si el ocupante es un
TTS Studio anterior. Si es otro programa, se detiene y te lo dice; ahí eliges:
cerrarlo tú, o arrancar en otro puerto con `PORT=3001 npm start`.

**La barra superior dice "ComfyUI no responde"** — el motor no está corriendo, o
está en otro puerto. La app apunta a `127.0.0.1:8188` salvo que se defina
`COMFY_URL`.

**"Sin voces" en el selector** — no hay ningún `.safetensors` en
`models/Qwen3-TTS/prompts/`.

---

## Cómo está armado

El navegador **nunca** habla con ComfyUI directamente: ComfyUI responde 403 a
cualquier petición que traiga un `Origin` ajeno, así que todas las llamadas al
motor salen del servidor de Next, que quita esa cabecera. Está medido y razonado
en el [ADR-001](directives/architecture/ADR-001-comfyui-bridge.md), y es la razón
de que esto no pueda ser un frontend estático.

```
web/src/app/page.tsx          la pantalla: escenario central + bandeja
web/src/components/           campo de audio animado · onda + reproductor
web/src/lib/comfy.ts          el saneador de cabeceras del ADR-001
web/src/lib/tts.ts            grafo Qwen3, envío y lectura de estado
web/src/app/api/              voices · generate · status · proxy a comfy
```
