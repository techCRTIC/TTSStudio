# Roadmap — TTS Studio

<!-- roadmap-checkpoint: done -->

> A dónde va este proyecto: fases y alcance. Propiedad de `producer`, mantenido
> por `doc-keeper`. Distinto del backlog (estacionamiento de ideas →
> `backlog.md`), de la cronología (`session-log.md`), del estado actual
> (`project-overview.md`) y de las decisiones puntuales (ADRs).
>
> Revisado el 2026-08-19 tras cerrar la verdad de producto (`PRODUCT.md`) y las
> dos decisiones de arquitectura (ADR-001, ADR-002).

## Alcances (scope)

**Dentro de alcance**
- Aplicación web local con interfaz, de un solo usuario, sobre Next.js.
- Generación de audio a partir de texto usando una voz clonada.
- Biblioteca de voces: registrar una voz desde audio de referencia, nombrarla,
  reusarla, borrarla.
- Historial persistente de generaciones.
- Guiones largos: segmentar, regenerar un tramo suelto, unir el resultado.
- Motor de voz local: Qwen3-TTS 1.7B sobre ComfyUI.
- Mejora de calidad por fine-tune, medida contra el benchmark existente.
- **Preparación del entorno en la máquina que ya tiene el repositorio**: auditar
  qué dependencias faltan, descargarlas, e instalar lo que se pueda automatizar
  con seguridad. *(Añadido el 2026-09-07 — ver `ADR-008` D0.)*

**Fuera de alcance**
- Multiusuario, autenticación, cuentas, permisos.
- **Instaladores públicos, despliegue a terceros y distribución.** El `.exe`
  empaquetado sigue fuera (`B-017`).
  *(Enmendado el 2026-09-07: esta línea decía «Despliegue a terceros,
  instaladores públicos, distribución» y fundía dos cosas distintas. Preparar el
  entorno en una máquina que **ya clonó el repositorio** no es distribuir, y
  dejarlas juntas bloqueaba el portal de instalación sin que nadie lo hubiera
  decidido. Separadas en `ADR-008` D0. Lo que sigue fuera es **empaquetar y
  enviar el producto a alguien que no lo tiene**.)*
- APIs de voz de pago.
- Generación de imagen (pertenece a la adopción de Comfy a nivel de estudio).
- Traducción, doblaje o sincronía labial.
- Edición de audio posterior: la app produce el archivo, no lo mezcla. Eso pasa
  en el editor de video o de audio del usuario.

## El MVP

**El MVP son las fases 0 y 1.** Está terminado cuando el usuario escribe un
texto, elige una voz, genera, escucha con progreso real mientras ComfyUI
trabaja, descarga el archivo, y encuentra esa generación ahí al día siguiente.

Criterio de éxito, en los términos de `PRODUCT.md`: **deja de abrir ComfyUI para
tareas de voz.**

---

### Fase 0 — Fundaciones técnicas
**Pregunta que responde:** ¿el navegador puede llegar al motor y volver con audio?
**Entregables**
- Proyecto Next.js + TypeScript + Tailwind + shadcn/ui en pie (ADR-002).
- Route handler que hace de proxy hacia ComfyUI, **quitando la cabecera
  `Origin`** (ADR-001), con un test que falla si alguien la reenvía. Es el primer
  bug previsible del proyecto y no se verifica a mano.
- Capa de tokens oscuros del spinoff de CRTIC clean.
- Un camino de extremo a extremo sin interfaz: texto entra, archivo de audio sale.

**Criterio de salida:** una llamada desde el navegador produce un audio generado
por Qwen3-TTS, y el test del `Origin` está en verde.

### Fase 1 — La pantalla de generación (MVP)
**Pregunta que responde:** ¿el ciclo escribir → generar → escuchar → juzgar es
más rápido aquí que en ComfyUI?
**Entregables**
- La superficie de generación en su estructura elegida.
- Estado real del motor, nunca una ruedita indeterminada ni un porcentaje
  inventado. *(Corregido el 2026-08-24: esta línea decía «progreso real desde el
  websocket de ComfyUI». No hay websocket — el cliente consulta
  `/api/status/:promptId` cada 700 ms y el motor solo reporta posición en la
  cola o ejecución, que es justamente por lo que `StatusLine` no pinta barras.
  Ver ADR-007.)*
- Reproducción con forma de onda y descarga del archivo.
- Historial persistente: cada generación queda guardada y se puede volver a ella.
- Manejo honesto de fallos: ComfyUI caído, VRAM insuficiente, cola ocupada.
- Movimiento reducido respetado en todo lo animado, y nada que se comunique solo
  por sonido.

**Criterio de salida:** el usuario produce audio utilizable sin abrir ComfyUI ni
editar un JSON, y encuentra lo de ayer sin buscarlo.

---

### Fase 2 — Biblioteca de voces
**Pregunta que responde:** ¿cómo se registran y conviven varias voces?
**Entregables:** alta de una voz desde audio de referencia (el servidor la
escribe en el `input` de ComfyUI) · escucharla, nombrarla, borrarla · selector en
la pantalla de generación · procedencia visible, porque las voces son de
personas identificables.
**Criterio de salida:** dos o más voces conviven y se eligen sin fricción.

### Fase 3 — Guiones largos
**Pregunta que responde:** ¿un guión de varios minutos se produce entero sin
pelear con la herramienta?
**Contexto:** el motor genera por tramos; un guión largo nunca es una sola
llamada. Esto es verdad de producto desde el día uno, y la arquitectura de las
fases 0 y 1 no puede cerrarle la puerta.
**Entregables:** segmentación del texto · regenerar un tramo suelto sin rehacer
el resto · unir los tramos en una pieza · que una frase corta siga costando lo
mismo que antes.
**Criterio de salida:** una narración de varios minutos sale completa y con las
costuras inaudibles.

### Fase 4 — Calidad de voz (fine-tune)
**Pregunta que responde:** ¿el fine-tune real supera a la clonación zero-shot, y
cuánto?
**Entregables:** dataset limpio desde el audio largo · fine-tune de Qwen3-TTS
1.7B · comparación contra el benchmark de 16 segmentos que ya existe · veredicto
documentado.
**Criterio de salida:** una mejora medida, o el registro honesto de que no la
hubo y por qué. No se afirma una mejora sin medirla contra esa línea base.

### Fase 5 — Uso diario
**Pregunta que responde:** ¿qué le falta para ser la herramienta de todos los días?
**Entregables:** generación por lotes · proyectos o agrupaciones · lo que el uso
real revele. Esta fase se llena con evidencia de uso, no se planifica ahora.
**Criterio de salida:** lo define el uso.
