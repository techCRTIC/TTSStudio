# Roadmap — TTS Studio

<!-- roadmap-checkpoint: pending -->

> A dónde va este proyecto: fases y alcance. Propiedad de `producer`, mantenido
> por `doc-keeper`. Distinto del backlog (estacionamiento de ideas →
> `backlog.md`), de la cronología (`session-log.md`), del estado actual
> (`project-overview.md`) y de las decisiones puntuales (ADRs).
>
> ⚠️ **Borrador de la sesión 1, pendiente de aprobación del usuario.** Los
> alcances sí están confirmados; las fases son una propuesta.

## Alcances (scope)

**Dentro de alcance**
- Aplicación con interfaz gráfica que corre en la máquina del usuario.
- Generación de audio a partir de texto usando una voz clonada.
- Biblioteca de voces: registrar una voz desde audio de referencia, nombrarla,
  reusarla.
- Historial de generaciones y exportación del audio.
- Motor de voz local: Qwen3-TTS 1.7B sobre ComfyUI.
- Mejora de la calidad de voz por fine-tune, medida contra el benchmark
  zero-shot existente.

**Fuera de alcance**
- Multiusuario, autenticación, cuentas, permisos.
- Despliegue a terceros, empaquetado para distribución, instaladores públicos.
- APIs de voz de pago (ElevenLabs y similares).
- Generación de imagen: pertenece a la adopción de Comfy a nivel de estudio,
  no a este proyecto.
- Traducción, doblaje o sincronía labial.

## Fases

### Fase 0 — Fundaciones técnicas
**Pregunta que responde:** ¿con qué se construye la app y cómo habla con el motor?
**Entregables:** ADR del stack de la aplicación · ADR del puente hacia ComfyUI
(API HTTP directa vs. otra vía) · esqueleto que arranca y llega al motor.
**Criterio de salida:** un "hola mundo" que manda texto al motor y devuelve un
archivo de audio, sin interfaz todavía.

### Fase 1 — Generación de extremo a extremo
**Pregunta que responde:** ¿se puede generar voz desde la interfaz, con una voz fija?
**Entregables:** pantalla de generación (texto → audio) · reproducción y
descarga del resultado · manejo de errores del motor (ComfyUI caído, VRAM
insuficiente, cola ocupada).
**Criterio de salida:** el usuario genera audio sin tocar ComfyUI ni un JSON.

### Fase 2 — Biblioteca de voces
**Pregunta que responde:** ¿cómo se registran y reusan varias voces?
**Entregables:** alta de una voz desde audio de referencia · listado, edición y
borrado · selector de voz en la pantalla de generación · almacenamiento del
material de referencia.
**Criterio de salida:** dos o más voces conviven y se eligen sin fricción.

### Fase 3 — Calidad de voz (fine-tune)
**Pregunta que responde:** ¿el fine-tune real supera a la clonación zero-shot,
y cuánto?
**Entregables:** dataset limpio a partir del audio largo · fine-tune de
Qwen3-TTS 1.7B · comparación contra el benchmark de 16 segmentos ya existente ·
veredicto documentado.
**Criterio de salida:** una mejora medida (o el registro honesto de que no la
hubo, con la razón).

### Fase 4 — Uso diario
**Pregunta que responde:** ¿qué le falta para ser la herramienta de todos los días?
**Entregables:** historial persistente · generación por lotes · proyectos o
agrupaciones · lo que el uso real revele.
**Criterio de salida:** el usuario deja de abrir ComfyUI para tareas de voz.
