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

**Status:** ✅ **PUBLICADO** — https://github.com/techCRTIC/TTSStudio
Público · rama `main` · **68 commits** · árbol limpio · licencia **MIT**.
**Last update:** 2026-09-07 (sesión 7)

**Verificado ejecutándolo esta sesión:** tipos · lint · build · **210 pruebas de
la app** (208 pasan, **2 se saltan solas** porque ComfyUI está apagado, 0
fallos) · **32 de Python** · los **cuatro verificadores de costura** · el
detector de diseño de `impeccable` sin hallazgos.

---

## ⚠️ LO PRIMERO: hay tres cosas que NADIE HA VISTO FUNCIONAR

Ninguna se arregla con más pruebas. Hay que mirar.

**1. El portal de instalación (sesión 7) — la MITAD está verificada.**

✅ **Verificado contra ComfyUI encendido:** el auditor consulta al motor de
verdad (`/object_info`) y el pack pasó de `no_verificable` a `instalada`. En
esta máquina el informe sale así: **las cuatro cosas que bloquean, puestas**, y
falta solo lo opcional — las nueve voces preestablecidas, 4 GB.

⚠️ **SIN verificar: todo lo que se ve y se pulsa.** La pantalla **no se ha
abierto en un navegador ni una vez** y **ninguna descarga se ha ejercitado**.

> **Prueba concreta, y en esta máquina el portal NO se abrirá solo** (no falta
> nada bloqueante): hay que **pulsar el engranaje de la cabecera**. Luego
> **Instalar** en las voces preestablecidas y comprobar tres cosas: que la barra
> se mueve, que al terminar la **re-auditoría** lo confirma, y que cerrar la
> pestaña a media descarga no deja nada que parezca instalado (debe quedar una
> carpeta con sufijo `.descargando`).

**2. El latido de ComfyUI (sesión 6).** `watchComfy()` en `scripts/start.mjs`
relanza el motor si se cae, hasta tres veces. **Nunca se ha ejercitado contra
una caída real.**

> **Prueba concreta:** levantar la app, matar ComfyUI a mano, mirar la consola
> del lanzador.

**3. Pendiente desde la sesión 5:** **escuchar una pieza larga unida** y juzgar
el volumen nivelado. Es el criterio de salida de la Fase 3 y ningún test puede
sustituirlo. Hay un guión listo en `.tmp/guion-prueba-costuras.txt` (5.815
caracteres, 4 tramos, **las tres costuras caen a mitad de párrafo**, que es el
caso difícil).

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
| `web/src/components/SetupPortal.tsx` | La pantalla. |
| `web/src/components/SetupGate.tsx` | **El engranaje de la cabecera** + decide si el panel se abre solo. Montado en la cabecera de `page.tsx`, al lado de `EngineHealth`. |

**Cuatro reglas que no son cosméticas:**

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

## Siguiente paso

1. **Mirar las tres cosas de arriba que nadie ha visto funcionar.** Es lo único
   que las convierte en reales.
2. **Documentación pendiente de una pasada:** mover **B-003, B-006 y B-012** a
   `## Cerradas` marcadas `[CERRADO]` conservando su número; anotar en **B-017**
   que «el portal sea dueño de ComfyUI» quedó **diferido a un ADR futuro**;
   nombrar la fase del roadmap a la que pertenece el portal; y actualizar
   `project-overview.md`, que **sigue describiendo la sesión 4**.
3. **Anotar en el backlog** que `tts_normalizar_texto.py` y
   `tts_revisar_texto.py` existen duplicados y **divergidos** (~500 líneas) entre
   `execution/` y `.claude/skills/voz-local/scripts/`.
4. **Borrar la rama de respaldo** cuando haya confianza.

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
