# Memoria — TTS Studio (índice)

> Una línea por memoria. Aquí van gotchas, restricciones aprendidas,
> preferencias y referencias que las living docs NO van a resurfacear solas.
> Lo que es cronología va a `session-log.md`; lo que es estado actual va a
> `project-overview.md`; una decisión de arquitectura va a un ADR.
>
> Cada memoria es un archivo propio con frontmatter (`name`, `description`,
> `metadata.type: gotcha | constraint | preference | reference`), cuerpo con
> **Why:** y **How to apply:**, y enlaces `[[name]]` entre memorias
> relacionadas. Curada por `doc-keeper`.

- [[node-refuses-cmd-without-shell]] — en Windows, Node no lanza un `.cmd` sin
  shell, y con shell avisa en cada ejecución. Llama al entrypoint JS de la
  herramienta. *(gotcha)*
- [[react-inline-style-fights-imperative-dom]] — si un efecto escribe una
  propiedad de estilo, esa propiedad NO puede estar también en el `style` de
  React: React la reaplica en cada render y pisa al efecto. *(gotcha)*
- [[canvas-loops-need-accumulated-time-and-zero-allocation]] — un lienzo animado
  debe acumular su propio tiempo y no asignar nada por fotograma, o se congela y
  brinca, y tirona rítmicamente. *(gotcha)*
- [[agent-background-server-dies-with-turn]] — un servidor arrancado como tarea
  de fondo de un agente no sobrevive al turno; el usuario lo levanta. *(constraint)*
- [[nextjs-maxduration-does-nothing-locally]] — en Next, `maxDuration` no
  impone nada en local: lo fija la plataforma de despliegue. Escribirlo simula
  un límite que no existe. *(gotcha)*
- [[python-stdout-is-not-utf8-on-windows]] — en Windows la salida de Python usa
  cp1252, no UTF-8; al leerla desde Node cada tilde se rompe. Y la consola
  miente en las dos direcciones: hay que mirar los bytes. *(gotcha)*
- [[qwen3-razona-salvo-en-completado-crudo]] — Qwen3 razona antes de responder
  y el interruptor no funciona vía ollama: vuelca el razonamiento dentro de la
  respuesta, en inglés. El completado crudo lo evita, pero a cambio el modelo
  deja de obedecer instrucciones y se inventa cosas. *(gotcha)*
- [[una-propiedad-css-con-dos-duenos-se-rompe-en-silencio]] — si dos sitios
  escriben la misma propiedad CSS, uno gana y el otro desaparece sin error.
  CSS propio > utilidad de Tailwind; `style` en línea > hoja de estilos. *(gotcha)*
- [[medir-un-alto-no-incluye-los-margenes]] — el alto de una caja excluye sus
  márgenes, así que animar un contenedor hasta el alto medido de su contenido lo
  deja corto y el recorte se come el final. *(gotcha)*
- [[especialistas-en-paralelo-se-pisan-las-dependencias]] — varios
  especialistas a la vez sobre el mismo árbol: el que necesita una pieza que
  otro aún no escribió la imita, y al limpiar su imitación borra el original.
  Declarar los archivos de cada uno no basta. *(gotcha)*
- [[especialista-sin-shell-no-puede-verificar]] — los especialistas del
  pipeline no siempre traen consola, asi que no pueden correr los tests que se
  les piden; el veredicto sale FAIL por eso y hay que verificar desde fuera.
  Trazar a mano no es ejecutar. *(constraint)*
