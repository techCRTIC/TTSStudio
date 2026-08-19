# TTS Studio

App local para generar voz clonada a partir de texto. Corre entera en esta
máquina: motor **Qwen3-TTS 1.7B** sobre **ComfyUI**, sin APIs de pago y sin que
la voz salga del equipo.

Qué es y para quién → [`PRODUCT.md`](PRODUCT.md) · a dónde va →
[`directives/roadmap.md`](directives/roadmap.md) · por qué está hecho así →
[`directives/architecture/`](directives/architecture/)

---

## Cómo correrlo

**1. ComfyUI tiene que estar arriba.** Es el motor; sin él la app abre pero no
genera (y lo dice en la barra superior en vez de fallar en silencio).

```bash
comfy launch --background          # queda en 127.0.0.1:8188
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8188/system_stats
```

**2. La app.**

```bash
cd web
npm run build     # solo tras cambiar código
npm run start     # http://localhost:3000
```

Para desarrollar, `npm run dev` recarga en caliente y no necesita build previo.

**3. Los tests.**

```bash
cd web && npm test
```

Siete, dos de ellos contra el ComfyUI real. Uno afirma que ComfyUI **sigue**
rechazando peticiones con `Origin` ajeno: si eso alguna vez cambia, el test se
cae y avisa de que el [ADR-001](directives/architecture/ADR-001-comfyui-bridge.md)
quedó obsoleto.

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

**`EADDRINUSE: address already in use :::3000`** — quedó un proceso Node vivo de
una ejecución anterior. Hay que matarlo por PID:

```bash
netstat -ano | grep "0.0.0.0:3000"     # la última columna es el PID
taskkill //PID <pid> //F
```

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
