# Project Overview — Comfy MCP

> Documento vivo: describe SIEMPRE el estado actual de esta investigación.
> Regla: nunca puede describir un estado de hace más de 2 sesiones.

## Identidad del proyecto
Investigación sobre **comfy-mcp** (https://github.com/Comfy-Org/comfy-mcp), el
servidor MCP de Comfy-Org que expone ComfyUI a agentes/LLMs vía el Model
Context Protocol. Nació de un scan de repo y **se convirtió, en la misma
sesión, en la instalación real de un stack completo de generación local**
(imagen, y voz) que el usuario quiere seguir usando de forma habitual.

## Estado actual (sesión 1, 2026-08-18 — sesión larga y densa)

**Instalado y funcionando en esta máquina:**
- comfy-cli 1.16.0 + comfy-mcp 0.10.0 (venv `~/comfy-mcp-venv`), servidor
  `comfy` registrado en Claude Code scope usuario (`✔ Connected`) — las 39
  tools MCP nativas quedan disponibles recién en la próxima sesión.
- ComfyUI en `~/comfy` (RTX 5090 Laptop, 24 GB VRAM).
- **Imagen**: se probó FLUX.1-dev fp8 primero (fallos de coherencia: escudo
  híbrido, tres equipos en cancha) y se reemplazó por **Qwen-Image 2512 +
  LoRA Lightning** (Apache 2.0) — gana en fidelidad y velocidad (4 steps,
  7-9s con modelo cacheado vs. 50 steps/119s en calidad completa, mejora
  marginal). Es el motor de imagen actual.
- **Qwen-Image-Edit 2511 + su LoRA Lightning** también instalados —
  necesario para el flujo de consistencia de personaje (ver abajo).
- **Voz**: nodo `ComfyUI-Qwen3-TTS` instalado (10 sub-nodos). Clonación
  zero-shot validada con 15s de referencia real (audio de "Andrés"),
  veredicto del usuario: "bastante decente". Benchmark de 16 segmentos
  real-vs-clonado hecho. Ritmo/emoción no son controlables por parámetro
  nativo en modo Voice Clone (solo `CustomVoice` con voces preestablecidas
  lo tiene) — la puntuación del texto sí afecta la calidad percibida de las
  pausas (no la duración total, que es un mal proxy).

**Hallazgo técnico central de la sesión**: el grafo correcto de
Qwen-Image-Edit 2511 en ComfyUI (para consistencia real de personaje vía
edición, no solo prompt repetido) requiere `TextEncodeQwenImageEditPlus`
(no la versión sin "Plus", que es del modelo *base*) + dos nodos fáciles de
omitir: `FluxKontextImageScale` y `FluxKontextMultiReferenceLatentMethod`.
Sin ellos, la salida colapsa (grillas rotas, personajes duplicados) —
**no es una limitación real del modelo**, es un grafo mal armado. Validado
dos veces con el personaje "Bruni" (surf + lectura junto al fuego): identidad
100% preservada en ambos casos, cero deriva, cero duplicación. Detalle en
`directives/session-log.md` (grafo canónico completo).

**Los 5 workflows validados de la sesión** (T2I y Edit, cada uno
rápido/calidad completa, más voice clone) quedaron promovidos a
`C:\Users\tech\comfy-workflows\` — **fuera de cualquier repo**, a propósito,
para ser tan universales como el servidor MCP `comfy` mismo (registrado a
nivel de usuario en Claude Code). README ahí con la clave JSON exacta de
cada parámetro a cambiar. Memoria hub apunta a esa carpeta.

**Pendiente:** probar las 39 tools MCP nativas cuando estén disponibles;
B-003 (fine-tune real de voz, backlog); decidir si se destilan los patrones
de diseño MCP de comfy-mcp para el estudio.

## Visión
El repo comfy-mcp dejó de ser solo objeto de investigación — el usuario
quiere **"seguir con comfy para todo"** (B-001, backlog): adoptarlo como
motor de generación de imagen/voz local por defecto del estudio, en vez de
APIs pagadas, para assets, prototipos y experimentos. Esta investigación es
ahora también el registro vivo de esa adopción.

## Arquitectura y stack
- **comfy-mcp**: wrapper MCP delgado sobre comfy-cli (detalle completo en
  `comfy-mcp_RepoScan.md`).
- **Imagen**: Qwen-Image 2512 (T2I) + Qwen-Image-Edit 2511 (edición
  condicionada a referencia), ambos con sus LoRAs Lightning. Grafos propios
  en formato API de ComfyUI (no templates de galería, que en varios casos
  resultaron rotos o del modelo equivocado).
- **Voz**: Qwen3-TTS 1.7B Base (clonación) vía el nodo comunitario
  `ComfyUI-Qwen3-TTS`. Whisper (`openai-whisper`, instalado en el venv de
  ComfyUI) para transcribir referencias y hacer benchmarks.
- **Herramientas de apoyo descubiertas en la máquina**: `ffmpeg` (vía
  Shutter Encoder, no estaba en PATH) para recorte/conversión de audio.

## Decisiones clave de diseño
- Slug `comfy-mcp`; primer paso `/repo-scan` antes de definir alcance fino.
- Qwen-Image sobre FLUX.1-dev como motor de imagen (más fiel, más rápido en
  este hardware).
- El escaneo de repo, la instalación y el uso en vivo quedan documentados
  en la MISMA investigación — no se abrió una investigación aparte para
  "usar" comfy-mcp.

## Estructura de directorios
Estándar del hub: `directives/` (bitácora, overview, backlog), `memory/`,
`.tmp/`. Dentro de `.tmp/imagenes/qwen/` y `.tmp/tts/` viven los
experimentos y resultados de esta sesión (workflows JSON reusables +
outputs). `.tmp/comfy-mcp/` es el clon del repo original para el scan.

## Restricciones conocidas
- El servidor `comfy` (MCP) necesita el `Scripts` del venv en el PATH de
  usuario — `comfy launch --background` re-invoca `comfy` por shell (gotcha
  documentado en memoria hub).
- Qwen3-TTS Voice Clone no tiene control nativo de velocidad/emoción.
- Los templates de galería de ComfyUI a veces referencian el modelo/nodo
  equivocado para la versión instalada — verificar contra el catálogo vivo
  (`comfy nodes show`) antes de asumir que un template sirve tal cual.
