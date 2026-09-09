# Active Session State

<!-- cierre -->
## 🧾 El cierre de cada sesión NO vive aquí
El resumen de cada sesión vive en `directives/session-log.md`, arriba del todo, y
es lo que la próxima sesión lee primero. **Este archivo es el detalle
recuperable** — el estado vivo de UNA sesión, no la crónica. Si crece por encima
de ~400 líneas ha dejado de servir: lo terminado se muda a la bitácora y esto se
reescribe. Se hizo el 2026-09-07, cuando llegó a 604.
<!-- /cierre -->

---

**Status:** sesión 8. Rama `main`. Verde: tipos · lint · **210 pruebas de la
app** (2 saltadas: el motor está caído) · 32 de Python · los 4 verificadores.
**Last update:** 2026-09-09

## 🔴 LO PRIMERO — dos cosas, y la segunda no es de esta app

### 1. ComfyUI está ROTO en esta máquina, y no por culpa nuestra
```
ModuleNotFoundError: No module named 'sqlalchemy'
```
Le falta esa dependencia a **su propio entorno**, así que **no arranca por
ningún camino**: ni desde la app, ni desde el lanzador, ni a mano. La orden:

```
C:/Users/tech/comfy/.venv/Scripts/python.exe -m pip install sqlalchemy
```

⚠️ **La tiene que correr el usuario.** El hook `enforce-venv.sh` la bloquea por
falso positivo: es un venv, pero no el del proyecto, y el patrón no distingue.

### 2. El `.exe` recién construido NO se ha visto abrir
`dist/TTS Studio Setup 0.1.0.exe`, 111 MB, construido el 2026-09-09.
**La prueba que falta es exactamente el fallo que esta sesión vino a arreglar:**
instalarlo **con ComfyUI apagado** y ver que la ventana abre y que el portal
ofrece «Arrancar».

📌 **La release pública v0.1.0 lleva el binario ROTO** (el que se cierra solo sin
ComfyUI). El `dist/` local tiene el mismo número de versión y contenido
distinto. **Antes de publicar hay que subir a 0.1.1**: dos binarios distintos
bajo un mismo número es una trampa para el que descargue.

## 🐛 El fallo del arranque, y su regla

El lanzador esperaba a **`/api/voices`** antes de mostrar la ventana, y esa ruta
**pregunta por ComfyUI** (502 con el motor caído). Sin motor nunca respondía OK,
así que la app agotaba un minuto y **se cerraba sola** diciendo que no había
arrancado.

**La regla que sale de esto, y que vale más que el arreglo:** *una comprobación
de vida no puede preguntar por una dependencia.* Preguntaba por otra cosa y
mataba al paciente por el resultado.

Ahora se pregunta por **`/api/health`**, que no sabe nada del motor. Está escrito
en la propia ruta que **no debe aprenderlo**: si alguien le añade una
comprobación de ComfyUI «para que sea más completa», el fallo vuelve entero.

**El mismo defecto estaba en `scripts/start.mjs`.** Ahí no mataba, solo mentía.

## 🔌 El portal ahora enciende e instala el motor

| Situación | Botón |
|---|---|
| Corriendo | — |
| Instalado pero apagado | **Arrancar** |
| No instalado | **Instalar ComfyUI** |

Lo hace `execution/arrancar_comfy.py`. **Enmienda `ADR-009` D1**, que decía que
el portal solo guiaba. Lo que NO cambia: ComfyUI se sigue **sin empaquetar**.

📌 **`comfy-cli` SALE CON CÓDIGO 0 AUNQUE EL LANZAMIENTO FALLE.** La verdad está
en el campo `ok` de su sobre JSON. Por eso el portal ahora extrae el motivo real
en vez de agotar el tiempo y decir «no respondió» — verificado contra el ComfyUI
roto de arriba.

## 🎨 El icono es el logotipo, por decisión del usuario

El `.ico` lleva **dibujos distintos por tamaño**: sin «STUDIO» a 16 y 24 px,
donde era ruido; el logotipo entero de 32 para arriba. Fuentes en `.tmp/logo/`,
assets en `desktop/recursos/`.

⚠️ Sigue siendo **rasterizado, no vectorial**. La oferta de redibujarlo en SVG
está en pie y sin aceptar.

---

**Status:** ✅ **PUBLICADO** — https://github.com/techCRTIC/TTSStudio
Público · rama `main` · **75 commits** · árbol limpio · licencia **MIT**.
**Last update:** 2026-09-07 (sesión 7)

**Verificado ejecutándolo esta sesión:** tipos · lint · build · **210 pruebas de
la app, CERO saltadas** (con ComfyUI encendido corren también las dos de
integración; apagado se saltan solas y salen 208) · **32 de Python** · los
**cuatro verificadores de costura** · el detector de diseño sin hallazgos.

---

## Cómo levantarlo

```
npm start        # desde la RAÍZ, no desde web/
```

Lo levanta **el usuario**: un servidor arrancado por un agente no sobrevive al
turno ([[agent-background-server-dies-with-turn]]).

⚠️ **`npm start` sirve una versión COMPILADA**: un cambio de código no se ve
hasta reiniciar el lanzador. Para iterar, `npm run dev`.

Hace falta **ComfyUI encendido** y, para el botón de reescribir, **ollama con
`qwen3:4b`**.

---

## 🧹 Una cosa a medias que hay que cerrar

**La rama `respaldo-antes-de-limpiar-historia` sigue en local**, y contiene la
historia vieja con el nombre real de una persona dentro. **NO SUBIRLA.**
Borrarla cuando haya confianza en el resultado:

```
git branch -D respaldo-antes-de-limpiar-historia
```

Existe porque esta sesión reescribió tres mensajes de commit con
`git filter-branch` para sacar ese nombre. Se comprobó que el contenido quedó
**byte a byte idéntico**: solo cambiaron los mensajes.

---

## El portal de instalación — para tocarlo

Decidido en `directives/architecture/ADR-008-setup-portal.md`, que **enseña sus
propias reversiones**: tres decisiones se recortaron el mismo día que se
aceptaron, por el encargo de «lo más simple posible», y una de esas podas se
corrigió durante la construcción.

| Archivo | Qué es |
|---|---|
| `execution/auditar_host.py` | El **único** auditor. Modo `--app`: evalúa los 7 requisitos y devuelve tres estados. |
| `execution/manifiesto.json` | **EL** mapa de dependencias (v2): modelos con carpeta y peso, packs, servicios, y los 7 requisitos en idioma humano. |
| `execution/instalar_dependencia.py` | Descarga con aterrizaje atómico · `pip install` contra el intérprete de ComfyUI · `ollama pull`. Progreso en NDJSON. |
| `web/src/lib/setup.ts` | Tipos + estrechamiento. **PURO** — lo importa el navegador. |
| `web/src/app/api/setup/audit/route.ts` | Corre el auditor. Responde siempre, aunque no pueda auditar. |
| `web/src/app/api/setup/install/route.ts` | Streaming NDJSON · lista blanca de ids · mata el proceso si se aborta. |
| `web/src/components/SetupPortal.tsx` | La pantalla. Diálogo completo: se pinta con `createPortal` en `document.body`, velo con desenfoque, botón de cerrar, foco atrapado y devuelto, Escape, scroll del fondo bloqueado. |
| `web/src/components/SetupGate.tsx` | **El engranaje de la cabecera** + decide si el panel se abre solo. Montado en la cabecera de `page.tsx`, al lado de `EngineHealth`. |

**Siete reglas que no son cosméticas:**

1. **No se cree al instalador.** Una dependencia se marca resuelta **solo cuando
   una re-auditoría la observa**. Un instalador puede salir 0 sin instalar nada.
2. **Tres estados, no dos.** `instalada` / `falta` / **`no_verificable`**. Con el
   motor apagado sus nodos no se pueden comprobar, y decir «falta» ahí mandaría a
   reinstalar lo que ya está. Es también donde cae un estado que el
   estrechamiento no reconoce: **la dirección del fallo está elegida**.
3. **Aterrizaje atómico.** Se descarga a `<nombre>.descargando` y se renombra al
   final. Por eso se pudo quitar el almacén de trabajos del servidor entero.
4. **Se rehúsa antes que usar el intérprete equivocado.** Si no aparece el Python
   de ComfyUI, el paso no se hace: instalar en el Python del sistema ensucia la
   máquina y **no** arregla al motor.
5. **Abrirlo a mano y que se abra solo NO son lo mismo.** El automático no se
   puede cerrar (detrás no funciona nada); el que pide el usuario siempre sí,
   aunque falte algo. Abrirlo a mano **vuelve a auditar** antes de pintar.
6. **El diálogo se pinta con `createPortal` en `document.body`, y NO es una
   preferencia.** La cabecera es `relative z-10`, o sea un contexto de
   apilamiento propio: dentro de ella un `z-50` solo compite contra sus
   hermanos, y el contenido principal —otro `z-10`, posterior en el DOM— se
   pintaba encima. **Subir el número no arregla esto.** `Select.tsx` ya lo
   resolvía igual.
7. **La salida espera a `transitionend`, no a un número.** La primera versión
   repetía en el JS los mismos 180 ms del CSS: dos sitios con un valor y nada
   que obligue a cambiarlos juntos. El plazo de seguridad de 600 ms solo cubre
   el caso en que ninguna transición llegue a correr.

**Dos cosas que el portal NO hace, a propósito:** no instala ComfyUI ni
comfy-cli (solo guía), y **no reinicia el motor** — instala las dependencias del
pack y te dice que lo reinicies tú. Por eso la decisión D9 del ADR no hizo falta.

⚠️ **Corrección viva:** el problema de `runScript` **no es** su tope de 60 s
(`web/src/lib/python.ts:78`), que es solo un valor por defecto que cualquier
llamador sobrescribe. El bloqueo real es que **acumula stdout en memoria y solo
resuelve al cerrar el proceso** (`:131-132, :155-156, :162`): no hay callback
incremental. Por eso la ruta de instalación hace `spawn` por su cuenta.

---

## ⚠️ Lo que hay que saber antes de tocar nada

1. **Las voces preestablecidas necesitan OTRO checkpoint.**
   `Qwen3-TTS-12Hz-1.7B-CustomVoice` (~4 GB) no está en disco; solo el `-Base`.
   Mientras falte, la app **no las ofrece**, a propósito. **El portal ya sabe
   descargarlo** — y ese es justamente el caso de prueba sin ejercitar.
2. **El umbral de troceo (1.600) es una apuesta, no una medición.** El motor
   aguanta 2.048. Nadie ha medido dónde aparece de verdad el bug de bucle.
3. **El tope de nivelado (±12 dB) tampoco está medido.**
4. **Los tamaños de los fixtures se derivan del umbral**, nunca se escriben a
   mano. Al subirlo de 600 a 1.600, cinco tests se pusieron en rojo por eso.
5. **Un tramo puede contener varios párrafos.** La pausa la pone el modelo al
   leer, no el unificador. Decisión del usuario, no un descuido.
6. **Se para ENTRE tramos, nunca a mitad de uno.** Cortar la llamada no detiene
   al motor: el trabajo ya está en su cola.
7. **Quedan cuatro botones primarios naranja macizo** en los cajones. Sin
   unificar a propósito: allí el fondo es el mismo tono que el relleno nuevo.

## 🐛 Gotchas que muerden de verdad

- **`B-008` ha mordido SIETE veces.** El guardián de secretos bloquea comandos
  por subcadena: un `grep` cuyo patrón contenga `.env`, `credential` o `token`
  se rechaza aunque sea una inspección legítima. **Rodeo:** usar las
  herramientas de búsqueda en vez del shell.
- **Una clase de caracteres rompe las tildes en UTF-8.** `grep "[eé]"` NO casa
  `é`, porque son dos bytes. Esto hizo que un recuento de datos personales
  saliera **21 archivos cuando eran 26**. **Buscar sin clases de caracteres.**
- **La salida de Python en Windows es cp1252**, no UTF-8
  ([[python-stdout-is-not-utf8-on-windows]]). Todo script que imprima acentos
  necesita `sys.stdout.reconfigure(encoding="utf-8")` o revienta.
- **Los archivos del proyecto tienen finales de línea MEZCLADOS.** Una misma
  bitácora tiene tramos con CRLF y tramos con LF, así que una sustitución de
  texto exacta falla sin motivo aparente. Reemplazar por número de línea cuando
  se resista.
- **`.claude/**` es el harness portable: el código de la app NUNCA puede depender
  de nada de ahí** (ADR-008 D2). Por eso el auditor vive en `execution/`.
- **Corre tú los tests después de una tanda del pipeline**
  ([[especialista-sin-shell-no-puede-verificar]]), y no des por bueno el disco
  sin mirarlo ([[especialistas-en-paralelo-se-pisan-las-dependencias]]).

---

## 💿 El `.exe` — CONSTRUIDO (sin probar el instalador)

**Electron**, `.exe` con **solo la app** (~19 MB de contenido propio). ComfyUI,
Python y modelos los instala el portal. Decidido en `ADR-009`.

| Archivo | Qué es |
|---|---|
| `scripts/engine.mjs` | **Nuevo.** La mitad compartida del lanzador: `ensureComfy`, `clearPort`, `watchComfy`, `matarArbol`. Parametrizada, **sin `process.exit` dentro** — lanza, y quien llama decide (una ventana no puede morirse como un CLI). |
| `scripts/start.mjs` | **Adelgazado.** Ahora solo hace lo que solo un terminal hace: compilar con el CLI de Next, abrir el navegador, y morir con un mensaje. |
| `desktop/main.mjs` | **Nuevo.** Proceso principal de Electron. |
| `scripts/prepare-desktop.mjs` | **Nuevo.** Ensambla `desktop/build/app/` y **comprueba** que lo ensamblado puede arrancar. |
| `web/next.config.ts` | `output: "standalone"` + **`outputFileTracingRoot` fijada**. |
| `package.json` | `main`, config de `electron-builder`, y los guiones `desktop:*`. |

**Guiones:** `npm run desktop` (abre la app empaquetada sin instalar) ·
`npm run desktop:dist` (produce el instalador en `dist/`).

### Lo que hay que entender antes de tocarlo

1. **El puerto se elige UNA VEZ y se guarda** (`userData/puerto.json`), y no es
   manía: el historial y los favoritos viven en `localStorage`, que Chromium
   particiona **por origen — puerto incluido**. Un puerto distinto en cada
   arranque le vacía el historial al usuario sin decir nada. Se prefiere 3000
   para que quien venga de `npm start` conserve el suyo.
2. **El servidor de Next es un HIJO de Electron**, arrancado con
   `ELECTRON_RUN_AS_NODE` (así no viaja otro Node). Se mata por **tres vías**
   independientes, porque en Windows un hijo **no** muere con su padre, y un
   huérfano se queda con el puerto.
3. **La app ya no adivina dónde está**: Electron le pasa `TTS_PROJECT_ROOT`, y
   `projectRoot()` lo respeta si contiene `execution/`.
4. **El portal ya corre SIN el entorno del proyecto** (`ADR-009` D6, cerrado).
   `stdlibPython()` usa el `.venv` si existe y, si no, **descubre** un Python
   del sistema. Solo `tts_unir_tramos.py` y `transcribe_audio.py` necesitan
   paquetes de terceros y siguen exigiendo `pythonPath()`.

### 🐛 Dos trampas descubiertas construyendo esto

- **`python3` en esta máquina es un SEÑUELO de la Microsoft Store**: está en el
  PATH, arranca, y no hace nada. Por eso `stdlibPython()` **ejecuta**
  `-c "print(1)"` en cada candidato en vez de fiarse de que exista. Encontrarlo
  y creerle daba un fallo mucho más tarde y peor de entender.
- **Instalar Electron rompió el empaquetado sin que nadie lo tocara.** Apareció
  un `package-lock.json` en la raíz, Next infirió otra raíz de proyecto y movió
  el servidor de `standalone/server.js` a `standalone/web/server.js`. Ahora la
  raíz está **fijada** en `next.config.ts`, y además el ensamblador **busca**
  `server.js` en vez de suponer. Lo cazó su propia comprobación de integridad.

### ✅ PUBLICADO COMO RELEASE — y el usuario confirmó que corre

**https://github.com/techCRTIC/TTSStudio/releases/tag/v0.1.0**
Etiqueta `v0.1.0`, instalador adjunto. GitHub renombra el archivo a
`TTS.Studio.Setup.0.1.0.exe` (puntos en vez de espacios) — **las notas citaban
el nombre con espacios y el comando de comprobación fallaba**; corregido.

**Publicar otra versión:** subir `version` en `package.json` ·
`npm run desktop:dist` · calcular el SHA-256 · `git tag -a vX.Y.Z` ·
`gh release create`. **A mano y sin actualización automática** (ADR-009 D9).

### ✅ El instalador

`dist/TTS Studio Setup 0.1.0.exe` — **115,5 MB** (23 MB son la app; el resto es
Chromium). SHA-256:
`989a3c9ec54ad618c340881a2132ac03a8b16c9fd34be613e032cc44f0bfdcd0`

**Comprobado abriendo el paquete**, no deducido: lleva `server.js`,
`.next/static` (sin eso saldría sin estilos), los 14 scripts de `execution/`,
el manifiesto y `pyproject.toml`. **No lleva** `src` ni `tests`. **No lleva
ComfyUI ni modelos** — se buscó: los únicos aciertos de «comfy» son la ruta de
la propia app, así que la línea de licencias sigue sin cruzarse.

⚠️ **PERO NADIE LO HA EJECUTADO.** Compilar y empaquetar no es funcionar, y
aquí hay más superficie nueva de la habitual: el puerto pegajoso, el servidor
como hijo, y el apagado por tres vías. **Instalarlo y abrirlo es la prueba que
falta**, y conviene hacerla con `npm start` cerrado para no confundir puertos.

> **Lo que estaba aquí de la sesión 7** —el portal sin ver, el `.exe` recién
> construido, la iteración del logo— **se movió a `session-log.md`**, que es
> donde vive la cronología. Este archivo es lo que hace falta AHORA.

## Siguiente paso

1. **Mirar las tres cosas de arriba que nadie ha visto funcionar.** Es lo único
   que las convierte en reales. **Empezar por pulsar el engranaje**: en esta
   máquina el panel no se abre solo porque no falta nada bloqueante.
2. **Cerrar el hueco de Python del `ADR-009` D6** antes de tocar Electron.
3. **Documentación pendiente de una pasada:** mover **B-003, B-006 y B-012** a
   `## Cerradas` marcadas `[CERRADO]` conservando su número; anotar en **B-017**
   que «el portal sea dueño de ComfyUI» quedó **diferido a un ADR futuro**;
   nombrar la fase del roadmap a la que pertenece el portal; y actualizar
   `project-overview.md`, que **sigue describiendo la sesión 4**.
4. **Anotar en el backlog** que `tts_normalizar_texto.py` y
   `tts_revisar_texto.py` existen duplicados y **divergidos** (~500 líneas) entre
   `execution/` y `.claude/skills/voz-local/scripts/`.
5. **Borrar la rama de respaldo** cuando haya confianza.

## Decisiones, con dónde viven

| Decisión | Dónde |
|---|---|
| El puente a ComfyUI quita la cabecera `Origin` | `ADR-001` |
| La procedencia vive en un archivo junto a la voz | `ADR-005` |
| Lo determinista lo hace código; el modelo solo lo que es criterio | `ADR-006` |
| Dónde vive la orquestación de tramos y quién escribe la pieza unida | `ADR-007` |
| Hasta dónde llega la app dentro de su propio entorno | `ADR-008` |
| Preparar el entorno **no** es distribuir; el `.exe` sigue fuera | `roadmap.md` + `ADR-008` D0 |
| MIT, y qué **no** cubre (modelos, ComfyUI, comfy-cli) | `LICENSE` + `README.md` |
| Electron, `.exe` con solo la app, release a mano y sin firmar | `ADR-009` |
| El `.exe` entra en alcance; redistribuir software ajeno no | `roadmap.md` + `ADR-009` D0 |
