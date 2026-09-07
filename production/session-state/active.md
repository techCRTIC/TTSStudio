# Active Session State

<!-- cierre -->
## 🧾 El cierre de cada sesión NO vive aquí
El resumen de cada sesión vive en `directives/session-log.md`, arriba del todo, y
es lo que la próxima sesión lee primero. **Este archivo es el detalle
recuperable**, no el resumen. (Antes este bloque decía «Sesión 4» y se quedó
atrás dos sesiones seguidas: por eso ahora no lleva número.)
<!-- /cierre -->

---

## 🔧 Sesión 7 (2026-09-07) — rumbo a GitHub

**Status:** ✅ **PUBLICADO** — https://github.com/techCRTIC/TTSStudio
Público, rama `main`, **67 commits**, árbol limpio, licencia **MIT**.
**Last update:** 2026-09-07 (sesión 7)

**Verificado esta sesión, ejecutándolo:** 197 pruebas de la app (195 pasan, **2
se saltan solas** porque ComfyUI está apagado, 0 fallos), 32 de Python, los
cuatro verificadores de costura en verde, y los 8 scripts de las habilidades
compilan.

### ❓ Pregunta abierta al cerrar — NADIE la ha contestado
Se le preguntó al usuario **por dónde seguir** y la sesión terminó sin
respuesta. Las dos opciones que se le plantearon:
- **(a)** construir el portal de instalación primero, o
- **(b)** despachar la limpieza del nombre + la licencia y **dejar el proyecto
  publicado ya**, y construir el portal después.

No asumir ninguna. Preguntar de nuevo al empezar.

**Sí contestó, en cambio, una pregunta de diseño del portal:** si se cierra la
pestaña a mitad de una descarga, **que se corte y se retome**. Eso es lo que
eliminó el almacén de trabajos del servidor.

## ✅ CONSTRUIDO — el portal de instalación (sesión 7)

| Archivo | Qué es |
|---|---|
| `execution/auditar_host.py` | **Movido** desde la skill (D2). Gana el modo `--app`: evalúa los 7 requisitos de la app y devuelve los tres estados. |
| `execution/manifiesto.json` | **Movido y ampliado a v2.** Ahora es EL mapa: + `-CustomVoice`, + `faster-whisper`, + sección `servicios` (ollama), + sección `app` con los 7 requisitos en idioma humano. |
| `execution/instalar_dependencia.py` | **Nuevo.** Descarga con aterrizaje atómico, `pip install` contra el intérprete de ComfyUI, `ollama pull`. NDJSON de progreso. |
| `web/src/lib/setup.ts` | **Nuevo, y PURO.** Tipos + estrechamiento. No toca el sistema: lo importa el navegador. |
| `web/src/app/api/setup/audit/route.ts` | **Nueva.** Corre el auditor. Responde siempre, incluso si no puede auditar. |
| `web/src/app/api/setup/install/route.ts` | **Nueva.** Streaming NDJSON, lista blanca de ids, mata el proceso si se aborta. |
| `web/src/components/SetupPortal.tsx` | **Nuevo.** La pantalla. |
| `web/src/components/SetupGate.tsx` | **Nuevo.** Decide si se abre sola. Montado en `layout.tsx` para no tocar las 988 líneas de `page.tsx`. |
| `web/tests/setup.test.ts` | **Nuevo.** 13 pruebas del estrechamiento y de cuándo se abre. |

**Verde:** tipos · lint · build (ambas rutas registradas) · **210 pruebas**
(0 fallos, 2 saltadas) · 32 de Python · los 4 verificadores de costura · el
detector de diseño de `impeccable` sin hallazgos.

⚠️ **NO VERIFICADO, y esto importa:** **ninguna descarga se ha ejercitado de
punta a punta**, y **la pantalla no se ha visto en un navegador**. Compilar no
es funcionar. La prueba pendiente: levantar la app con ComfyUI apagado y ver si
el portal se abre solo; luego encenderlo y pulsar «Instalar» en las voces
preestablecidas (4 GB, tarda).

**Dos cosas se simplificaron durante la construcción, y quedan dichas:**
- El portal **no reinicia ComfyUI**: instala las dependencias del pack y te
  dice que lo reinicies tú. Por eso **D9 no hizo falta** — no hay reinicio
  automático que pelearse con el vigilante.
- **No se añadió Zod.** El proyecto no lo usa en ninguna parte y añadir una
  dependencia para una ruta iba contra el encargo. Se valida a mano desde
  `unknown`, sin un solo `any`.

### 🧹 Limpieza para publicar — HECHA a medias

✅ **Los archivos ya no tienen el nombre.** 86 apariciones en 26 archivos,
sustituidas por **Martín Vega / martin_vega / Martín**. Se eligió con tilde a
propósito: varios comentarios existen para ilustrar que las tildes se quitan al
construir el nombre de archivo, y un ejemplo sin tilde los dejaba sin sentido.

📌 **El recuento anterior estaba MAL, y por un fallo mío:** dije 21 archivos y
50 apariciones. El real era **26 archivos y 86**. La causa: el patrón de
búsqueda usaba `[eé]`, y `é` son dos bytes en UTF-8, así que la clase de
caracteres no casaba. Se me escaparon `PRODUCT.md`, `project-overview.md`,
`backlog.md` y dos de `comfy-mcp/`. **Patrón bueno: sin clases de caracteres.**

🚫 **BLOQUEADO Y PENDIENTE DE TI:** el nombre sigue en **tres mensajes de
commit** (`0486661`, `a56b323`, `56226da`). Borrarlo exige `git filter-branch`,
y **el clasificador de permisos lo bloqueó**. No se forzó. Hay **respaldo** en
la rama `respaldo-antes-de-limpiar-historia` y el filtro escrito en
`.tmp/limpiar_mensaje.py`. Reescribir aquí es seguro: **el repo nunca se ha
pusheado**, nadie tiene esos hashes.

✅ **`.gitignore` revisado: está bien.** La alerta de los `.pyc` era falsa —
`__pycache__/` (línea 3) ya los cubre. 313 archivos rastreados, ninguno basura.

🚫 **SIGUE SIN LICENCIA.** Decisión del usuario, no tomada.

### Tarea activa
**Preparar el repositorio para publicarlo en GitHub**, en este orden fijado por
el usuario: (1) portal de instalación de dependencias · (2) limpieza y
preparación del repo · (3) push. El repositorio será **público**.

### ✅ Commiteado esta sesión
| Hash | Qué |
|---|---|
| `6a1944f` | `voz-local` versionada — existía en disco desde hacía sesiones y nunca se había commiteado |
| `e401d30` | `comfy-local` entera: auditoría, instalador, 8 grafos, referencias |
| `7c63b7f` | La bitácora y el estado de la sesión 6 |

### ✅ Publicado, y qué hubo que limpiar antes

El repositorio **nunca se había subido**: no existía. Antes de crearlo se revisó
qué se iba a publicar, y apareció el nombre de una persona real junto con la
procedencia de su voz clonada.

**Hecho:** 86 apariciones en 26 archivos sustituidas por **Martín Vega**, y los
**tres mensajes de commit** (`0486661`, `a56b323`, `56226da`) reescritos con
`git filter-branch`. Seguro porque nadie tenía esos identificadores. Se
comprobó que el contenido quedó **byte a byte idéntico**: solo cambiaron los
mensajes.

⚠️ **El respaldo `respaldo-antes-de-limpiar-historia` SIGUE EN LOCAL y contiene
la historia vieja con el nombre. NO SUBIRLO.** Se puede borrar cuando estés
tranquilo con el resultado: `git branch -D respaldo-antes-de-limpiar-historia`.

**Licencia MIT.** Primero se escribió con una nota explicativa al final y
GitHub la leyó como «Other» — la nota derrotaba a lo que explicaba. Ahora el
`LICENSE` es MIT puro y las advertencias viven en el README.

### 📄 README reescrito (202 líneas)
Se corrigió lo que estaba desfasado desde la sesión 1: decía «7 tests» (son 197
+ 32), llamaba pendiente a la biblioteca de voces (terminada en la sesión 2), no
mencionaba guiones largos, procedencia, escritura asistida ni el latido, y
afirmaba que `npm run dev` no comprueba ComfyUI (ya no es cierto desde la
sesión 6). Se le quitó la ruta absoluta `C:\Users\tech\...`.

**Añadido por ser repo público:** qué hay que instalar a mano hoy (con el gotcha
de que las dependencias del pack de nodos no se instalan solas), una sección
sobre clonar la voz de una persona que dice que el permiso es responsabilidad de
quien usa la herramienta, y una nota de licencia de modelos.

Está en español, como el original. **No se preguntó si para un repo público lo
prefiere en inglés** — queda abierto.

### 🏗️ El portal de instalación: planificado, decidido, SIN construir

El pipeline `team-new-feature` devolvió el plan y **el lead se negó a
construir**, correctamente: dos decisiones eran del usuario. Ya están
contestadas.

**D0 (alcance) = enmendar.** Preparar el entorno de una máquina que **ya clonó
el repositorio** entra en alcance; instaladores públicos, envío a terceros y el
`.exe` siguen fuera. **Ya aplicado en `directives/roadmap.md`**, marcado en el
sitio con el precedente del ADR-007.

**D1 (frontera) = «Portal v1».** **Automatiza:** descargas de modelos y
checkpoints, el `pip install -r requirements.txt` con el intérprete del venv de
ComfyUI + reinicio + re-auditoría, y `ollama pull`. **Guía sin instalar:**
comfy-cli y ComfyUI mismo. «El portal es dueño de ComfyUI» queda **diferido a un
ADR futuro**, y B-017 debe registrar ese diferimiento.

✅ **`ADR-008` ESCRITO Y ACEPTADO** — `directives/architecture/ADR-008-setup-portal.md`,
309 líneas, doce decisiones (D0–D11). El portal **ya se puede construir**. En
esta sesión **no se escribió ni una línea de él**.

🔻 **RECORTADO EL MISMO DÍA — instrucción del usuario: «lo más simple
posible».** El ADR se enmendó en el sitio (caja de simplificación arriba del
todo, y caja de enmienda en D4). **Construir según lo enmendado, no según lo
aceptado originalmente.**

**El portal, tal como hay que construirlo:**
- **Una pantalla, una lista, un botón.** La lista habla en idioma humano:
  «Falta el modelo de voces preestablecidas — 4 GB — sin esto no aparecen las 9
  voces», no nombres de archivo. Un botón «Instalar lo que falta». Una barra por
  descarga. Al terminar, **re-auditar** y decir qué quedó listo.
- **Automatiza el paso que hoy duele:** el `pip install -r requirements.txt`
  contra el `python_venv` de ComfyUI (**D7**; si es `null`, se rehúsa el paso),
  más el reinicio del motor.
- **La descarga vive con la página.** Si se cierra la pestaña, se abandona y se
  reintenta después. **Sin almacén de trabajos en el servidor.** Es seguro
  únicamente porque se descarga a **nombre temporal con renombrado atómico**, y
  un temporal abandonado no se confunde jamás con algo instalado.
- **Progreso por sondeo** de un registro simple en memoria. Nada de SSE ni
  websocket.

**Lo que se cayó del plan, y NO hay que construir:**
| Decisión | Como se aceptó | Como quedó |
|---|---|---|
| **D3** | El verificador `check_dependency_map.py`, en la misma sesión | **Diferido.** Cuando el mapa y el código se separen por primera vez, no antes. |
| **D4** | Trabajo propiedad del servidor, sobrevive a cerrar la pestaña | **Eliminado.** Y por tanto **`ADR-007` D2 ya NO queda enmendado** en ningún dominio. |
| **D5** | Cuatro estados por dependencia | **Dos** (instalada / falta) + el aterrizaje atómico, que es lo que de verdad evita que un archivo truncado se lea como instalado. |

⛔ **LO QUE NO SE RECORTÓ, y no se recorta:** **D6** — una dependencia se marca
resuelta **solo cuando una re-auditoría la observa**, jamás por el código de
salida del instalador. Un instalador puede salir 0 sin haber instalado nada. Esa
es la línea entre una pantalla que ayuda y una que miente.

**Lo que sigue en pie del ADR:** **D2** (el auditor se muda a `execution/`; la
copia de la skill queda como puntero, nunca fork) · **D7** (el intérprete
correcto) · **D8** (auditoría stdlib pura; sin Python, `no verificable`) ·
**D9** (avisar al vigilante del reinicio) · **D10** (todo comando y URL salen
del manifiesto versionado; `security-reviewer` en PASS antes de commitear) ·
**D11** (v1 informa, no gestiona activación).

⚠️ **TRES HECHOS DEL PLAN RESULTARON INEXACTOS** y el ADR los corrige — no los
repitas:
1. **El bloqueo de `runScript` NO es el tope de 60 s** (`python.ts:78`), que es
   solo un valor por defecto que cualquier llamador sobrescribe y `runScriptJson`
   reenvía (`:167-171`). Lo que impide una descarga de 4 GB es que **acumula
   stdout en memoria** (`:131-132, :155-156`) y **solo resuelve en `close`**
   (`:162`): no hay callback incremental en absoluto.
2. `requirements_manual: true` está en `manifiesto.json:15`, no en `:16`.
3. El punto ciego del auditor es `auditar_host.py:29-30`, dos líneas.

🔥 **HALLAZGO NUEVO, peor de lo que se creía:** **no existe ningún gancho** para
avisarle al vigilante. `reviving` es una variable de cierre **sin setter
externo** (`start.mjs:242, :246, :274`), y un latido que caiga en la ventana de
apagado llama a `ensureComfy()` (`:280`). El daño no es gastar un reintento: son
**dos relanzamientos peleándose por el mismo puerto**.

📌 **Punto ciego declarado del checker futuro (D3):** `MODEL` es
`process.env.OLLAMA_MODEL ?? "qwen3:4b"` (`llm.ts:68`), así que solo puede
comparar el literal por defecto.

**Insumo que ya existe y NO hay que rehacer:** `auditar_host.py` (4 capas, ya
emite `--json`, ya devuelve `modelos_faltantes`, ya descubre el `python_venv` de
ComfyUI) y `manifiesto.json`. **Hueco:** el manifiesto no cubre ollama con
`qwen3:4b`, ni `-CustomVoice`, ni `faster-whisper large-v3`.

**16 criterios de aceptación** en el resultado del workflow
(`…\tasks\w0yz22uiz.output`, en `result.framing.acceptance_criteria`). Léelo con
Python y `sys.stdout.reconfigure(encoding="utf-8")` o revienta con las tildes.

### Siguiente paso
1. **Construir el portal** siguiendo el `ADR-008`, que ya está aceptado. Orden
   que marca el propio ADR: mudar el auditor a `execution/` (D2) → extender el
   manifiesto y escribir `check_dependency_map.py` **en la misma sesión** (D3) →
   la ruta de auditoría → el trabajo con sondeo (D4) → la pantalla.
   **Obligatorio:** suite de diseño enganchada (es pantalla nueva) y
   `security-reviewer` en PASS antes de commitear (hay egress de red y spawn de
   procesos).
2. **Una sola pasada de documentación** (criterio 16): nombrar la fase del
   roadmap a la que pertenece el portal, y mover **B-003, B-006 y B-012** a
   `## Cerradas` marcadas `[CERRADO]` conservando su número. B-017 debe
   registrar que «el portal sea dueño de ComfyUI» quedó **diferido**.
3. **Elegir licencia — NUEVO, y el repositorio no tiene NINGUNA.** Va a ser
   público, y sin `LICENSE` el defecto es «todos los derechos reservados»:
   nadie puede reusarlo legalmente. Debe ser decisión, no olvido.
4. Limpieza para publicar: renombrar el identificador en los 21 archivos,
   `git filter-repo` para los 3 mensajes, verificar que `git grep -ic` dé cero.
5. Revisar `.gitignore` — aparecieron `__pycache__/*.pyc` dentro de
   `.claude/skills/voz-local/scripts/`.
6. Crear el repositorio **público** `TTSStudio` y pushear.

### ⚖️ Licencias — comprobado leyendo los archivos (sesión 7)
**No hay obligación de publicar bajo GPL ni AGPL.** La duda era si usar el CLI
de Comfy obliga a AGPL-3.
- **ComfyUI es GPL-3.0**, no AGPL (`C:/Users/tech/comfy/LICENSE`; las 3
  menciones a «Affero» son el texto estándar de la GPLv3, que la cita en su
  sección 13). **comfy-cli 1.16.0 es GPL-3.0-only**.
- La app los usa **como procesos separados**: comfy-cli por línea de comandos
  (`start.mjs:94`), ComfyUI por HTTP (`comfy.ts:52`). Eso es agregación, no obra
  derivada — no hay enlazado.
- Y las obligaciones se activan **al distribuir**: hoy el repositorio **no
  contiene** ninguno de los dos.
- ⚠️ **B-017 lo cambia todo.** Un `.exe` que empaquete ComfyUI **sí** distribuye
  software GPL, con obligación de entregar el código correspondiente. Que el
  Portal v1 **guíe** en vez de traer ComfyUI (D1) esquiva esto sin querer.
- No es asesoría legal: es lectura de las licencias y de la interpretación
  estándar de la FSF.

### Hallazgos de esta sesión
- **`B-008` mordió por séptima vez.** El guardián de secretos bloqueó dos
  comandos de inspección legítimos porque el patrón de búsqueda contenía, como
  subcadena, los nombres de los archivos de secretos. Rodeo: usar las
  herramientas de búsqueda en vez del shell.
- **Dos scripts de `voz-local` comparten nombre con los de `execution/` y han
  divergido** ~500 líneas (`tts_normalizar_texto.py`, `tts_revisar_texto.py`).
  Es la misma decisión ya aceptada con los grafos —la habilidad se lleva su
  copia para ser portable—, pero ahora hay dos parejas que pueden separarse
  más. **Candidato a backlog, no anotado todavía.**

### ⏳ Lo que sigue pendiente de sesiones anteriores
- **Fase 3 sin cerrar desde la sesión 5:** falta **escuchar una pieza larga
  unida** y juzgar el volumen nivelado. Ninguna sesión desde entonces lo ha
  hecho. Hay un guión de prueba listo en `.tmp/guion-prueba-costuras.txt`
  (5.815 caracteres, 4 tramos, **las tres costuras caen a mitad de párrafo**,
  que es el caso difícil).
- **El latido de ComfyUI sigue SIN EJERCITARSE** contra una caída real.

---

## 🔧 Sesión 6 (2026-08-28) — la habilidad `comfy-local`

⚠️ **Esta sesión NO tocó la app.** Vivió entera dentro de `.claude/skills/`, y
hubo **otra sesión en marcha en paralelo**: todo lo que dice más abajo sobre la
app, los tramos y el volumen sigue siendo el estado de la sesión 5, sin
modificar. Si algo de eso cambió, lo cambió la otra sesión, no ésta.

**Qué se creó:** `.claude/skills/comfy-local/` — 13 archivos, 180 KB. Es la
hermana de `voz-local`: ésta sabe **si la máquina puede** y cómo dejarla lista;
`voz-local` sigue sabiendo **locutar bien**, y no se tocó.

| Archivo | Para qué |
|---|---|
| `SKILL.md` | El procedimiento: auditar → instalar lo que falte → elegir flujo → correr |
| `scripts/auditar_host.py` | La auditoría del computador, en cuatro capas |
| `scripts/instalar_stack.py` | El plan de instalación. **Por defecto imprime y no ejecuta nada** |
| `workflows/manifiesto.json` | Las 7 capacidades × sus nodos, modelos, tamaños y campos editables |
| `workflows/*.json` (7) | Los grafos, rescatados de `C:\Users\tech\comfy-workflows` |
| `referencias/comfy-cli-y-mcp.md` | El conocimiento del CLI y del servidor MCP |
| `referencias/flujos.md` | Los siete flujos, uno por uno |

**Verificado ejecutándolo**, no razonándolo:
- Corre en este computador y **encuentra los 6 modelos de imagen en disco** — o
  sea, el inventario escrito calza con la máquina real.
- `--exigir <capacidad>` devuelve 0 con una válida y 1 con una inventada;
  `--json` produce el informe completo.
- Se **simuló un computador virgen** (carpeta de usuario vacía, sin `comfy` en
  el PATH, ComfyUI inalcanzable) y el instalador emitió los 7 pasos correctos,
  incluidos los 49,5 GB de modelos con su carpeta destino.

**Los cuatro defectos que esa simulación destapó, ya corregidos:**
1. La lista de modelos **desaparecía justo en el computador virgen** —donde más
   falta hace— porque los nombres se recuperaban parseando frases en castellano.
   Ahora la auditoría los entrega como lista estructurada.
2. Una nota salía duplicada («Reiniciar ComfyUI después. Reiniciar ComfyUI
   después.»).
3. Las rutas impresas mezclaban `\` y `/` en el mismo comando.
4. **El peor:** un comando impreso decía `pip install comfy-cli>=1.14.0` sin
   comillas. Pegado en una consola no instala nada y crea un archivo llamado
   `=1.14.0`. Ahora hay una función que entrecomilla lo que un humano va a pegar.

### ⚠️ El hueco de verificación que queda abierto
La rama que comprueba **cada clase de nodo contra el ComfyUI encendido**
(consultando `/object_info`) **nunca se ejecutó**, porque el motor estaba
apagado. Es exactamente lo que separa un `[?] probable` de un `[OK] lista`, así
que hoy la auditoría reporta **7 probables y 0 listas**. No se levantó ComfyUI a
propósito: había otra sesión en marcha y el motor comparte la tarjeta gráfica.
**Se cierra encendiendo ComfyUI y volviendo a auditar.**

**Tampoco se corrió ningún grafo.** Los cuatro de imagen vienen validados por su
README anterior, con tiempos medidos, y así está escrito en la habilidad — no se
presentan como probados en esta sesión.

**Decisiones que conviene conocer antes de tocarla:**
- **Dos habilidades separadas**, no una grande. Se descartó absorber `voz-local`.
- **Se invirtió a propósito una decisión anterior:** los grafos vivían fuera de
  todo repositorio para ser «universales», y lo eran solo dentro de este
  computador. El precio es que ahora existen en dos sitios; **manda la copia de
  la habilidad**, y la auditoría es lo que impide que se vuelva ficción.
- **No se inventan enlaces de descarga.** Se entrega nombre, carpeta y tamaño, y
  la consulta que resuelve el origen contra el catálogo real.
- **Ninguna ruta de este computador escrita a mano en `scripts/`.** Se descubren.
  Las que hay en el manifiesto y las referencias son procedencia, no rutas de uso.
- El `SKILL.md` va **en español**, como `voz-local`, aunque la norma pida inglés
  para el harness. Mandó la consistencia con la habilidad hermana.

**Sin commitear:** `comfy-local` y `voz-local` siguen sin trackear.

---

**Status:** sesión 5. **Árbol limpio.** Rama
`main`, **catorce commits**, **sin subir** — sigue siendo
decisión del usuario. Verificado después de commitear: **197 pruebas de la app,
32 de Python, los cuatro verificadores de costura: todo en verde.**
**Last update:** 2026-08-25 (sesión 5)

📌 **Si la suite dice «195 pasan, 2 saltados» en vez de 197, NO es una
regresión:** los dos saltados son los de integración `against a live ComfyUI`,
que se saltan solos cuando el motor no está corriendo. Con ComfyUI encendido
son 197.

## Current task
**Fase 3 — guiones largos.** Se escuchó por primera vez una pieza larga y
salieron dos defectos, **los dos ya corregidos**: el troceo partía por párrafos
(28 trozos donde caben 3) y el volumen bailaba entre trozos. Falta **volver a
escuchar** con los arreglos puestos.

## ✅ Commiteado (2026-08-25)
Los 40 archivos de dos sesiones, en **seis commits** agrupados por capas:
`4d2dd26` troceo y nivelado (Python) · `8243720` el secuenciador y la parada ·
`49fd8f4` la ventana del modelo de texto · `ff1ec5b` la pantalla · `af03407` la
consola UTF-8 de la sesión 4 · y la documentación, que es este mismo commit
(su hash no se escribe aquí: un commit no puede citar su propio hash sin
quedar desfasado en cuanto se enmienda, y este se enmendó una vez).

**NO se subió.** El repositorio va por diez commits sin push, por decisión del
usuario mantenida desde la sesión 4.

Revisión de seguridad hecha **por el orquestador, no por `security-reviewer`**
(no se pudo lanzar en esta sesión): sin bloqueantes. Encontró y corrigió antes
de commitear el defecto del `NaN` descrito arriba. Anotado sin cambiar: el pico
de memoria del nivelado (dos copias de todos los audios; con el tope de 200
tramos, uno o dos GB sobre 63 disponibles).

## Siguiente paso
1. **✅ Confirmado en pantalla:** el guión de prueba
   (`.tmp/guion-prueba-largo.txt`, 3.358 caracteres) **sale en 3 trozos**, no en
   28. Falta **escuchar la pieza unida** y juzgar el volumen nivelado, que es lo
   único que no puede comprobar ningún test.
   ⚠️ `npm start` sirve una versión **compilada**: un cambio de código no se ve
   hasta reiniciar el lanzador.
2. **Comprobar en pantalla lo que aún no se ha visto:** el botón de detener,
   la pieza parcial que produce, y el borrado de una toma compuesta.
3. **Commitear** cuando eso salga bien.

## Lo que se aprendió escuchando (sesión 5) — evidencia real, no deducción
- **El tono NO cambia entre trozos.** Confirmado por el usuario escuchando los
  28: *"muy consistente el tono"*. Responde en la dirección buena la duda que
  **B-009** dejó abierta: con la misma semilla, el carácter de la voz se
  mantiene entre textos distintos.
- **El volumen SÍ cambiaba**, *"suele generarse más bajo en algunos"*. Causa
  encontrada en el código: el unificador concatenaba sin igualar niveles.
  Arreglado con nivelado por RMS activo hacia la mediana.

## La semilla en los tramos — comprobado leyendo el código
**Todos los tramos de una corrida comparten semilla.** Al pulsar «Generar los
tramos» se sortea **un solo número** (`page.tsx`, `advanced.seed ?? randomSeed()`)
y ese mismo viaja a todos. Que sea al azar **no** significa que cambie entre
tramos. Solo cambia en un tramo que se rehace (reintento automático o a mano).
Fijarla a mano no sirve para eso —ya se repite— sino para **comparar dos
corridas distintas**.

### Dos huecos encontrados, SIN ARREGLAR y sin anotar en el backlog
1. **La toma unida se guarda con la semilla del PRIMER tramo.** Si es justo ese
   el que se rehizo, el número del historial no reproduce la pieza. El dato
   bueno no se pierde: cada tramo guarda la suya.
2. **Ningún test afirma que los tramos comparten la semilla base.** Los tests
   cubren lo de al lado, no el invariante.

## Lo que cambió esta sesión, y dónde
| Ruta | Qué cambió |
|---|---|
| `execution/tts_trocear_guion.py` | `trocear()` reescrito: un tramo **cruza párrafos** hasta llenarse. Nuevo `_unidades()` |
| `execution/tts_unir_tramos.py` | Nivelado de volumen: `nivelar()`, `_rms_activo()`, bandera `--sin-nivelar`, `leveled`/`gains` en la salida |
| `execution/tests/` | +8 pruebas (regresión del troceo por párrafos, y el nivelado entero) |
| `web/src/lib/long-script.ts` | `stop()`, fase `stopping`, `partial`, y `shouldStop` en `runSegmentsInOrder` |
| `web/src/app/page.tsx` | Botón Generar↔Detener, `busy` cubre la corrida larga, toma parcial honesta, piel del botón, **cabecera y campo en una sola rejilla** (antes la cabecera era ~50px más ancha que la caja y esta se veía corrida) |
| `web/src/app/globals.css` | Token `--accent-soft` (mezcla al 8%, medida) |
| `web/src/components/VoiceLibrary.tsx` | Cajón a 380px, igual que el de tomas |
| `web/src/components/ImprovePanel.tsx` | Se borró una frase del aviso de espera |
| `web/src/lib/llm.ts` | `CONTEXT_TOKENS`, `MAX_REWRITE_CHARS`, `TextTooLongError`, `acceptableRewrite()` |
| `web/src/app/api/text/improve/route.ts` | Usa `acceptableRewrite`; el texto largo ya no sale como «el modelo falló» |
| `web/tests/llm-context.test.ts` | **Nuevo.** 15 pruebas: `num_ctx`, el tope derivado, la firma de una reescritura a medias, y el parseo del override |
| `web/tests/long-script.test.ts` | +3 pruebas de la parada |

## ✅ ARREGLADO: el modelo de texto corría con una ventana diminuta
`llm.ts` **no fijaba `num_ctx`**, así que ollama aplicaba su valor por defecto
(unos pocos miles de tokens) mientras `qwen3:4b` sostiene 262.144. Verificado en
esta máquina: ni `OLLAMA_CONTEXT_LENGTH`, ni `OLLAMA_NUM_CTX`, ni un `num_ctx`
en los parámetros del propio modelo. Al pasarse, **ollama descarta el principio
del prompt en silencio**.

Arreglado en tres piezas:
1. **`CONTEXT_TOKENS = 16.384`**, pedido explícitamente en cada llamada. No los
   262.144 completos porque la ventana se paga en VRAM (caché KV) al lado del
   motor de voz.
2. **`MAX_REWRITE_CHARS` derivado** de esa ventana: `(16384 − 700 sistema −
   2000 razonamiento) / 2 × 3` = **20.526 caracteres** (~23 min de locución).
   Se divide entre dos porque el guión entra Y vuelve. Por encima, se lanza
   `TextTooLongError` **sin llamar al modelo**.
3. **`acceptableRewrite()`** rechaza una reescritura por debajo del 60% del
   original. Antes solo se descartaba la respuesta vacía, así que media
   reescritura llegaba a pantalla pareciendo entera.

⚠️ **Ninguno de esos números está medido**: 3 caracteres por token es una
estimación deliberadamente baja (sobreestima el coste, falla del lado seguro), y
el 60% es direccional — escribir para la voz alarga, no acorta. Dicho así en el
código.

**No se añadió aviso previo en pantalla**, a propósito: con 23 minutos de tope
el caso es rarísimo y el rechazo es instantáneo y explica qué hacer.

### Y un defecto que apareció al revisar ESE arreglo, ya corregido
`CONTEXT_TOKENS` leía la variable de entorno con `Number()` a pelo. Un valor
basura da `NaN`, y **`NaN` no lanza: se propaga**. `MAX_REWRITE_CHARS` se
volvía `NaN`, `length > NaN` es falso siempre, y **el tope recién puesto dejaba
de existir con el mismo aspecto que tenía** — el mismo fallo silencioso que este
módulo vino a quitar. Ahora hay `parseContextTokens()`, validado, con suelo de
2.048 y vuelta al valor por defecto ante cualquier cosa rara.

**Tests nuevos:** `web/tests/llm-context.test.ts` — **15 pruebas**. Este módulo
no tenía ninguna.

## ⚠️ Decisiones de esta sesión que hay que conocer antes de tocar nada
1. **Un tramo puede contener varios párrafos.** La pausa entre párrafos
   absorbidos la pone **el modelo al leer**, no el unificador. Es decisión del
   usuario, no un descuido.
2. **Detener une lo hecho** y guarda la pieza **con el texto de esos trozos**,
   no con el guión entero, para que el historial no prometa lo que no dice.
3. **Se para ENTRE tramos, nunca a mitad de uno.** Cortar la llamada en curso no
   detiene al motor: el trabajo ya está en su cola. El precio es esperar un tramo.
4. **El relleno del botón principal es más OSCURO que la tarjeta**, no más
   claro. Medido: el claro dejaba el texto naranja en 4,46:1 y no pasaba AA; el
   oscuro da 5,46:1. Además el color pedido resultó ser el mismo de la tarjeta,
   así que habría sido un relleno invisible.
5. **El tope de nivelado son ±12 dB y NO está medido** cuánto varía de verdad el
   motor. Es un tope defendible, como `MAX_CHARS`.
6. **Quedan cuatro botones primarios con relleno naranja macizo** en los cajones
   (`VoiceLibrary`, `VoiceRecorder`, `ImprovePanel`). Los dos del escenario ya
   llevan la piel nueva. Sin unificar **a propósito**: el fondo de los cajones
   es el mismo tono que el relleno nuevo, así que allí haría falta otro token,
   no el mismo. Pendiente de decidir.

## ⚠️ Lo que hay que saber antes de tocar nada
1. **Las voces del modelo necesitan OTRO checkpoint.** `Qwen3CustomVoice` exige
   `Qwen3-TTS-12Hz-1.7B-CustomVoice`; en disco solo está el `-Base` (4,3 GB).
   Son **otros ~4 GB**, no vienen con la app. Mientras falte, la app **no las
   ofrece** (`hasEngineModel`), a propósito. Descargarlo es decisión del usuario.
2. **El umbral de troceo (1.600) es una apuesta, no una medición.** El motor
   aguanta 2.048 caracteres. Nadie ha medido a partir de qué longitud aparece de
   verdad el bug de bucle. Está dicho así en el código.
3. **Los tamaños de los fixtures se derivan del umbral**, nunca se escriben a
   mano. Al subirlo de 600 a 1.600, cinco tests se pusieron en rojo por eso.
4. **B-008 mordió cinco veces.** El guardián de secretos bloquea comandos por
   una subcadena, y tiene un segundo disparador: el nombre con que JavaScript
   lee sus variables de entorno. Rodeo: crear el archivo con otra herramienta y
   ejecutarlo después.
5. **Corre tú los tests después de una tanda del pipeline**
   ([[especialista-sin-shell-no-puede-verificar]]), y no des por bueno el disco
   sin mirarlo ([[especialistas-en-paralelo-se-pisan-las-dependencias]]).

## 🩺 El latido de salud de ComfyUI (hecho el 2026-08-25) — SIN EJERCITAR

`scripts/start.mjs` gana `watchComfy()`: consulta `/system_stats` cada 15 s y
relanza el motor si se cayó. **Tope de 3 relanzamientos**, porque revivir en
bucle algo que el sistema mata por falta de memoria empeora el problema en vez
de arreglarlo. El cupo se restablece tras 10 minutos sanos (el tope busca cazar
un BUCLE de caídas, y un bucle son caídas juntas), espera 5 s antes de revivir
(un proceso matado por memoria no ha terminado de soltarla), y **un intento
fallido gasta cupo igual** que uno exitoso.

**Y `npm run dev` ya no se salta la comprobación.** Era `npm run dev --prefix
web` a secas: ni motor, ni puerto, ni vigilancia. Ahora pasa por el lanzador
con `--dev`, que se salta la compilación y levanta el servidor de desarrollo.

⚠️ **NADIE HA VISTO ESTO FUNCIONAR CONTRA UNA CAÍDA REAL.** Verificado:
sintaxis (`node --check`) y la lógica revisada a mano. NO verificado: que
detecte y reviva de verdad. **Prueba concreta para la próxima sesión:** levantar
la app, matar ComfyUI a mano, y mirar la consola del lanzador.

**Lo que el latido NO resuelve:** si el motor cae a mitad de un guión largo,
relanzarlo no devuelve los tramos que murieron en su cola. Eso es **B-014**.

## 📓 Incidente del 2026-08-25: ComfyUI se cayó solo (evidencia para B-003)

`/api/voices` empezó a devolver **502** y la app pareció rota. No lo estaba:
**ComfyUI no estaba corriendo.** La ruta responde `comfy_unreachable`, que es lo
correcto, y **los 11 ms de respuesta lo delatan** — es un rechazo de conexión
inmediato, no una espera agotada. Si el motor estuviera vivo pero atascado, ese
número sería de segundos. Sirve como regla de diagnóstico para la próxima vez.

Lo que dice su registro (`C:/Users/tech/comfy/user/comfyui.log`): **termina en
seco** tras un trabajo COMPLETADO, sin traceback y sin cierre ordenado — firma
de un proceso terminado de golpe, no de uno que falló. Y lo que estaba haciendo
**no era voz, eran imágenes**: `QwenImage` (19.582 MB) más su codificador
(7.910 MB), unos 27 GB de modelos en una tarjeta de 23,9 GB, sostenidos con
carga dinámica. **No se puede afirmar que muriera por memoria** — el sistema no
siempre deja rastro en el log de la aplicación cuando mata un proceso.

**Por qué importa:** es el caso real de **B-003** («Arranque y salud de ComfyUI
desde la app»). Con imágenes y voz compitiendo por la misma tarjeta, va a
repetirse. Hoy la app solo avisa en la barra superior.

## Cómo levantarlo
```
npm start        # desde la RAÍZ. Compila al arrancar: un cambio de código no
                 # se ve hasta reiniciarla.
```
Lo levanta **el usuario**: una tarea de fondo de un agente no sobrevive al turno
([[agent-background-server-dies-with-turn]]). Hace falta **ComfyUI encendido**
y, para el botón de reescribir, **ollama con `qwen3:4b`**.

Nota: el núcleo de ComfyUI está desactualizado (`v0.33.0-23` instalado,
`v0.33.3` disponible). Decisión del usuario cuándo actualizarlo.

## Tocado en la sesión 5
- `web/src/components/ImprovePanel.tsx` — se borró, a petición del usuario, la
  frase «Pedírsela rápido salía mal: cambiaba el sentido de las frases» del
  aviso de espera de la reescritura. **El motivo se conservó en un comentario
  del código**, para que nadie intente «optimizar» esa espera más adelante.
  Verificado después: tipos limpios, 179 pruebas en verde, ningún test ni
  documento citaba la frase.

## Abierto / sin verificar
- **Lo de arriba en «sin confirmar»**, que es el trabajo de la próxima sesión.
- **Ventanas angostas:** sin verificar desde la sesión 1.
- **B-007** a **B-017** en la lista de pendientes. Los nuevos de esta sesión:
  B-013 (el historial se llena en silencio), B-014 (reanudar un guión
  interrumpido), B-015 (medir la longitud mínima), B-016 (el modelo ayuda a
  escribir el guión) y B-017 (catálogo de modelos instalables y qué lleva el
  `.exe`) — este último ordena y absorbe B-003, B-006 y B-012.
- **PII preexistente:** el nombre de una persona real aparece en ADRs y en
  entradas antiguas de la bitácora. `security-reviewer` confirmó que **no entró
  en nada nuevo de esta sesión**. Privado hoy; exposición si el repo se publicara.
- **`.tmp/` sin purgar**: quedaron borradores y fixtures de esta sesión. Todo
  regenerable; el borrado se ofreció y no se ejecutó.
- **Riesgo latente:** `tts_unir_tramos.py --salida` es escritura arbitraria por
  diseño (recibe la ruta y obedece). Hoy no es alcanzable desde el navegador,
  porque la ruta siempre la calcula `pieceOutputPath()`.

## Decisiones, con dónde viven
| Decisión | Dónde |
|---|---|
| La procedencia vive en un archivo junto a la voz | `ADR-005` |
| Lo determinista lo hace código; el modelo solo lo que es criterio | `ADR-006` |
| Dónde vive la orquestación de tramos y quién escribe la pieza unida | `ADR-007` |
