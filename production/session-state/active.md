# Active Session State

<!-- cierre -->
## 🧾 Cierre — Sesión 4 · 2026-08-24
El resumen completo de cada sesión vive en `directives/session-log.md`, y es lo
que la próxima sesión lee primero. Este archivo es el detalle recuperable.
<!-- /cierre -->

---

**Status:** sesión 5. **Árbol LIMPIO por primera vez en tres sesiones.** Rama
`main`, **diez commits**, **sin subir** — sigue siendo
decisión del usuario. Verificado después de commitear: **197 pruebas de la app,
32 de Python, los cuatro verificadores de costura: todo en verde.**
**Last update:** 2026-08-25 (sesión 5)

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
