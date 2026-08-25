---
name: especialista-sin-shell-no-puede-verificar
description: Los especialistas que lanza el pipeline no siempre traen herramienta de consola, así que no pueden correr los tests que se les piden. Lo dicen si se les enseñó a decirlo, pero el veredicto del pipeline sale FAIL y hay que correrlos desde fuera.
metadata:
  type: constraint
---

# Un especialista sin consola no puede probar nada

En la sesión 4, las dos tandas del pipeline terminaron con los archivos escritos
y **cero tests ejecutados**. Los especialistas lo declararon con todas las
letras:

> «this delegated session has no Bash/execution tool, only Read/Glob/Grep/Write/
> Edit… per the task's own gate this is not yet verified green; it needs someone
> with shell access to run `node --test`».

No fue un descuido suyo: la tarea les pedía «córrelos y no reportes hecho hasta
verlos verdes», y ellos no tenían con qué. Prefirieron decirlo antes que fingir
un verde, que es exactamente lo que debían hacer.

**Why:** el veredicto del pipeline sale **FAIL** por ese bloqueo, y es fácil
leerlo como «el código está mal» cuando lo que dice es «nadie lo ha probado».
Peor sería lo contrario: dar por bueno un informe que dice «lo tracé a mano y
estoy seguro». Trazar a mano no es ejecutar — en esa misma sesión, un fixture
escrito con confianza comparaba `undefined` con `undefined` y pasaba sin probar
nada.

**How to apply:**
- **Corre siempre tú los tests después de una tanda del pipeline**, aunque el
  informe suene confiado. Es la única evidencia que cuenta.
- Al leer un veredicto FAIL, **separa el bloqueo por falta de herramienta de un
  hallazgo real**. En la sesión 4 el FAIL traía las dos cosas mezcladas: uno se
  resolvía corriendo los tests, el otro era un criterio genuinamente sin cubrir.
- Al escribir la tarea, **no le pidas a un especialista que verifique lo que
  quizá no pueda**: pídele el código y los tests, y quédate tú la verificación.
- Si un informe afirma verde sin decir qué comando corrió, trátalo como no
  verificado.

Relacionado: [[especialistas-en-paralelo-se-pisan-las-dependencias]] — la otra
forma en que un informe de agente no describe el disco.
