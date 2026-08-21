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
