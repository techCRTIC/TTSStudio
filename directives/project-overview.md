# Project Overview — TTS Studio

> Documento vivo: describe SIEMPRE el estado actual del proyecto.
> Regla: nunca puede describir un estado de hace más de 2 sesiones.

## Identidad del proyecto
**TTS Studio es una aplicación con interfaz para generar voz clonada a partir de
texto.** Escribes un texto, eliges una voz previamente clonada, y obtienes
audio. Alrededor de eso vive lo que hace usable el flujo: una biblioteca de
voces, historial de generaciones y exportación.

Corre **enteramente en la máquina del usuario**, sobre el stack de generación
local que ya está instalado (ComfyUI + Qwen3-TTS). **Es una herramienta
personal de un solo usuario** — no hay multiusuario, ni autenticación, ni
despliegue a terceros.

Nace de una investigación previa (`comfy-mcp/`, cerrada el 2026-08-18) que
validó la clonación de voz zero-shot con material real y dejó el stack montado.

## Estado actual (sesión 1, 2026-08-19)

**Definido:** identidad, motor, audiencia, alcance, stack, dirección visual.
**Construido: la Fase 0 del roadmap, terminada y verificada.**
- Proyecto Next.js 16.3.1 en `web/` (React 19.2.8, Tailwind 4, Geist ya cableado).
- Capa de tokens del spinoff oscuro de CRTIC clean, con los contrastes medidos.
- El proxy hacia ComfyUI (`/api/comfy/[...path]`) que exige el ADR-001, con el
  saneador de cabeceras aislado como función pura en `src/lib/comfy.ts`.
- 7 tests en verde, 2 de ellos contra el motor real, y build de producción
  correcto. Verificado de extremo a extremo: una petición con `Origin` de
  navegador atraviesa el proxy y devuelve 200 con datos reales de ComfyUI.

**Fase 1 (el MVP) sin empezar.**

**Heredado y funcionando en esta máquina** (de la investigación `comfy-mcp/`):
- ComfyUI + comfy-cli + el servidor MCP `comfy` registrado a nivel de usuario
  en Claude Code (`✔ Connected`, 39 tools disponibles).
- **Qwen3-TTS 1.7B Base** vía el nodo comunitario `ComfyUI-Qwen3-TTS`, con
  clonación zero-shot validada sobre 15 s de referencia real. Veredicto del
  usuario sobre la calidad: "bastante decente".
- Un benchmark de 16 segmentos real-vs-clonado, que es la **línea base de
  calidad** contra la que se medirá cualquier mejora futura.
- Whisper (en el venv de ComfyUI) para transcribir referencias.
- Hardware: RTX 5090 Laptop, 24 GB de VRAM.

**Decisiones cerradas esta sesión:** ADR-001 (puente a ComfyUI) y ADR-002
(stack). La verdad de producto vive en `PRODUCT.md`.

## Visión
Que clonar una voz y producir audio con ella deje de ser un experimento de
grafos en ComfyUI y pase a ser una operación de dos clics. El techo de calidad
lo pone el modelo, y ahí el siguiente escalón conocido es el **fine-tune real**
de Qwen3-TTS con material largo, en vez de la clonación zero-shot actual.

## Arquitectura y stack
- **Motor de voz:** Qwen3-TTS 1.7B Base local, vía ComfyUI. Sin APIs cloud:
  cero costo por uso y la voz nunca sale de la máquina.
- **Puente hacia el motor (ADR-001):** la app habla con la API HTTP de ComfyUI
  **siempre desde el servidor**. Se midió que ComfyUI responde 403 a cualquier
  petición con `Origin` ajeno, así que un frontend estático puro no es
  implementable. El servidor MCP `comfy` queda fuera del runtime.
- **Aplicación (ADR-002):** Next.js App Router + TypeScript + Tailwind 4 +
  shadcn/ui, en `web/`. Sus route handlers son el proxy que el ADR-001 exige.
- **Dirección visual:** spinoff oscuro de **CRTIC clean**. Se hereda todo
  (Geist, un solo acento naranja, profundidad ganada, easings expo/quart/wave);
  cambia que las superficies suben hacia la luz en vez de bajar hacia el blanco,
  y que **la profundidad se hace con luz y no con sombra**, porque una sombra
  proyectada sobre fondo oscuro no se ve. Estructura de pantalla elegida:
  escenario central + bandeja lateral.
- **Grafos de referencia:** los workflows validados viven **fuera de este
  repo**, en `C:\Users\tech\comfy-workflows\`, a propósito — son universales al
  usuario, no de este proyecto.

## Decisiones clave de diseño
| Decisión | Razón | Alternativas descartadas |
|---|---|---|
| App con interfaz, no pipeline de scripts | El objetivo es usarlo a diario, no automatizarlo | Pipeline sin UI · laboratorio de fine-tuning · servicio con API |
| Motor local Qwen3-TTS | Ya está instalado y validado con material real; cero costo por uso; la voz no sale de la máquina | APIs cloud (ElevenLabs) · evaluar otras opciones open source primero · híbrido local+cloud |
| Un solo usuario | Herramienta personal: elimina autenticación, multiusuario y despliegue del alcance | Yo + clientes · producto para terceros |

## Estructura de directorios
```
TTSStudio/
├── .claude/            harness portable (22 agentes, skills, docs, hooks)
├── directives/         living docs + architecture/ADR-*.md
├── production/         estado de sesión y entregables
├── execution/          scripts Python deterministas (Layer 3)
├── memory/             memoria del proyecto (un hecho por archivo)
├── comfy-mcp/          investigación heredada (ver "Restricciones")
└── .tmp/               scratch, gitignored
```

## Restricciones conocidas
- **Qwen3-TTS en modo Voice Clone no tiene control nativo de velocidad ni
  emoción** (solo el modo `CustomVoice`, con voces preestablecidas, lo tiene).
  La puntuación del texto sí afecta la calidad percibida de las pausas. Esto
  acota qué controles puede ofrecer la interfaz.
- El servidor MCP `comfy` necesita el `Scripts` del venv en el PATH de usuario:
  `comfy launch --background` se re-invoca a sí mismo por shell.
- La carpeta heredada `comfy-mcp/` asume vivir dentro de un hub de
  investigaciones que aquí no existe (referencia un `investigaciones/INDEX.md`
  y un puntero raíz ausentes). Arrastra ~105 MB en su `.tmp/`, de los cuales
  **61 MB son los audios de Andrés — material no regenerable y materia prima
  del fine-tune futuro**. Está gitignorado, así que no afecta al repo.
