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

## Estado actual (sesión 4, 2026-08-24)

**La aplicación existe, se usa a diario, y ya dice guiones largos: los parte,
los genera tramo a tramo, revisa cada uno y los une en una sola pieza.**

- `web/` — Next.js 16.3.1 + React 19 + Tailwind 4 + Geist. Se levanta con
  `npm start` desde la raíz: un lanzador comprueba ComfyUI, libera el puerto,
  compila, sirve y abre el navegador.
- **La pantalla** es un escenario centrado que arranca plegado como una barra de
  búsqueda y se despliega al pincharlo: área de escritura que crece con el
  texto, un raíl de herramientas a su costado, y **dos botones circulares que se
  transforman en los cajones laterales** — voces a la izquierda, historial a la
  derecha.
- **Guiones largos (Fase 3, terminada en código).** Por encima de 1.600
  caracteres el texto se trocea por frases completas, la app enseña los cortes
  para que se confirmen, genera tramo a tramo mostrando **«tramo K de N»** más
  el estado real del motor, **detecta el bug de bucle** comparando duración con
  caracteres y **rehace ese tramo con otra semilla**, y une todo con pausas
  distintas entre frase y entre párrafo. El resultado es **una sola toma** en el
  historial. Por debajo del umbral, el camino es idéntico al de siempre: ni un
  proceso de más. Ver `ADR-007`.
- **Biblioteca de voces (Fase 2, terminada).** Alta desde audio de referencia o
  micrófono, transcripción propia corregible, **procedencia visible** (ADR-005),
  escucha sin generar una toma, y borrado real del disco (ADR-004). Desde la
  sesión 4 conviven con **las nueve voces preestablecidas del modelo**, marcadas
  aparte — pero solo aparecen si su checkpoint (`-CustomVoice`, una descarga
  distinta) está en disco.
- **Escritura asistida.** Un botón revisa ortografía y ritmo con reglas
  **medidas** y propone una versión escrita para que la lea una voz, marcando
  qué palabras cambiaron. Lo determinista lo hacen scripts de `execution/`; el
  modelo local solo hace lo que es criterio (ADR-006).
- **El puente al motor** vive en `web/src/lib/comfy.ts` + las rutas bajo
  `web/src/app/api/`. **179 tests de la app y 24 de Python en verde**, ninguno
  saltado. La mitad determinista tiene arnés propio (`pytest`) desde la sesión 4.
- **Salud verificada al cierre:** tipos, lint y compilación limpios; **cuatro
  verificadores de costura** (`execution/check_*.py`) en verde; el detector de
  diseño sin hallazgos.

**Fases 0, 1, 2 y 3 terminadas en código.** La 3 no está cerrada del todo: su
criterio de salida es que **las costuras suenen inaudibles**, y eso solo se
juzga escuchando una pieza unida de verdad, cosa que aún no se ha hecho.

**Sin verificar:** el comportamiento en ventanas angostas, pendiente desde la
sesión 1. **Sin medir:** la longitud mínima bajo la cual no tiene sentido juzgar
un tramo por su duración (B-015), y si una misma semilla conserva el carácter
entre textos distintos (B-009).

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
- **Los dos modos usan checkpoints DISTINTOS** (sesión 4, confirmado por el
  error del propio motor): la clonación necesita `Qwen3-TTS-12Hz-1.7B-Base` y
  las voces preestablecidas `…-CustomVoice`. Son dos descargas de ~4 GB cada
  una, no una. La app no ofrece las voces del modelo si su checkpoint falta.
- **El motor acepta 2.048 caracteres de entrada por pasada**, que es lo que
  obliga a trocear un guión largo. El techo de audio (~8192 tokens, unos 11
  minutos a los 12,56 tokens/s medidos) rara vez es el que ata.
- El servidor MCP `comfy` necesita el `Scripts` del venv en el PATH de usuario:
  `comfy launch --background` se re-invoca a sí mismo por shell.
- La carpeta heredada `comfy-mcp/` asume vivir dentro de un hub de
  investigaciones que aquí no existe (referencia un `investigaciones/INDEX.md`
  y un puntero raíz ausentes). Arrastra ~105 MB en su `.tmp/`, de los cuales
  **61 MB son los audios de Andrés — material no regenerable y materia prima
  del fine-tune futuro**. Está gitignorado, así que no afecta al repo.
