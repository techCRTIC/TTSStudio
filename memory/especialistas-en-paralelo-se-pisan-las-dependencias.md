---
name: especialistas-en-paralelo-se-pisan-las-dependencias
description: Cuando varios especialistas trabajan a la vez sobre el mismo árbol, el que necesita una pieza que otro todavía no ha escrito la imita para probar lo suyo — y al limpiar su imitación borra el original ya escrito. Declarar los archivos de cada uno no basta.
metadata:
  type: gotcha
---

# Un especialista limpia su imitación y se lleva el original

En la sesión 4 se lanzaron cinco especialistas en paralelo sobre el **mismo
árbol de trabajo** (se desactivó a propósito el aislamiento en copias separadas,
porque las tareas tenían que leerse entre sí). Cada tarea declaraba qué archivos
eran suyos, y ninguno tocó los de otro **a propósito**.

Aun así, `execution/tts_unir_tramos.py` desapareció. Lo que pasó, reconstruido
desde el registro de los agentes:

1. El especialista de las rutas de servidor necesitaba ese programa para probar
   las suyas. Cuando empezó, **todavía no existía** — lo estaba escribiendo otro
   en ese mismo momento.
2. Escribió una **imitación** suya en la ruta real y probó contra ella. Once
   pruebas en verde.
3. Al terminar, borró la imitación «para devolver el repositorio a su estado
   verdadero (sin el programa)» — y para entonces el original **sí existía**.
   Su `cp` lo había pisado y su `rm` lo borró.

Nadie hizo nada malicioso ni salió de su alcance declarado: la limpieza era
correcta según lo que ese agente creía del mundo, y su creencia había caducado.

**Why:** el aislamiento en copias separadas evita esta clase de choque, pero
impide que las tareas se lean entre sí. Elegir árbol compartido es una decisión
legítima; lo que no es legítimo es creer que declarar «estos archivos son tuyos»
la hace segura. El choque no viene de invadir el archivo de otro, viene de
**crear y luego limpiar un sustituto de algo que todavía no existía**.

**How to apply:**
- Si eliges árbol compartido, dile a cada especialista que un sustituto
  temporal de la pieza de otro **vive en el scratchpad, nunca en su ruta real**,
  y que si necesita ponerlo en su sitio, no lo borra: lo deja y lo reporta.
- Ordena las tareas cuando una depende de la salida de otra, en vez de
  paralelizarlas y confiar en que se coordinen.
- **Comprueba en disco lo que reportaron.** Los cinco informaron «hecho» y uno
  de los archivos reportados no estaba. Un informe de un agente es una
  afirmación, no una observación.
- Si un archivo desaparece, está entero en la transcripción del agente que lo
  escribió (`agent-*.jsonl`, la llamada a Write): se recupera byte por byte.

Relacionado: [[agent-background-server-dies-with-turn]] — la otra forma en que
el estado de un agente no sobrevive a lo que uno supone.
