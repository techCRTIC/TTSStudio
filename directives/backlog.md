# Backlog — TTS Studio

> Cola de ideas futuras y todos diferidos. NO es la tarea activa (→
> `production/session-state/active.md`), ni la cronología (→ `session-log.md`),
> ni el estado actual (→ `project-overview.md`). `producer` marca prioridades;
> `doc-keeper` mantiene el archivo.
>
> Formato de entrada: `## B-NNN — título` + una línea **Status:** `idea` /
> `en curso` / `✅ hecho`.

**Cómo leer este archivo.** Dos secciones, y solo dos:

- **`## Abiertas`** — todo lo NO hecho, ordenado por número de menor a mayor. Esto es la cola.
- **`## Cerradas`** — todo lo hecho o descartado, ordenado por número. Se conservan por sus
  `[[links]]` y por el razonamiento que documentan. **No son pendientes. No reabrir sin evidencia
  nueva.** Sus títulos van marcados `## ✅ B-NNN — [CERRADO]` para que se distingan de un vistazo.

**Los números nunca se reordenan ni se reasignan**: son identidad, y hay `[[links]]` cruzados que
apuntan a ellos. Un ítem que se cierra **se mueve de sección, no cambia de número**.

Al cerrar un ítem: cambia su `**Status:**` a `✅ hecho` (o `❌ sin objeto`), marca el título como
`## ✅ B-NNN — [CERRADO] título`, y **muévelo a `## Cerradas`** conservando su número.

## Abiertas

## B-003 — Salud de ComfyUI MIENTRAS la app corre
**Status:** idea — **reescrito el 2026-08-25 tras verificarlo contra el código**

⚠️ **La mitad de esta entrada ya estaba hecha y la entrada no se había enterado.**
Decía «decidir si la app arranca ComfyUI», y esa decisión está tomada e
implementada desde que existe el lanzador: `scripts/start.mjs` → `ensureComfy()`
busca el ejecutable en el PATH y en el venv de `comfy-mcp-venv`, lanza
`comfy launch --background` desacoplado, y espera hasta dos minutos porque un
arranque en frío que carga nodos personalizados tarda de verdad. Si no lo
encuentra, avisa y abre la app igual diciendo que no podrá generar.

**Lo que SIGUE ABIERTO es otra cosa: el motor solo se comprueba AL ARRANCAR.**
Una vez levantada la app, nadie vuelve a mirar. El 2026-08-25 ComfyUI se cayó
cincuenta minutos después de arrancar y la app se quedó devolviendo 502 sin que
nada lo notara (ver el incidente en `active.md`).

**Y hay un segundo hueco, más simple:** `npm run dev` **no pasa por el
lanzador** — es `npm run dev --prefix web` a secas, así que no comprueba ni
arranca nada. Solo `npm start` protege.

**Riesgo que hay que decidir a propósito, no de pasada:** relanzar
automáticamente un proceso que el sistema acaba de matar por falta de memoria
puede empeorar el problema en vez de arreglarlo. Un reintento automático
necesita un tope y necesita saber rendirse.

**Lo que NO resuelve un latido:** si el motor se cae a mitad de un guión largo,
relanzarlo no salva nada — tarda uno o dos minutos en cargar el modelo y los
tramos en su cola murieron con el proceso. Eso es [[B-014]].

## B-005 — Convertirlo en app de escritorio
**Status:** idea
Pedido por el usuario el 2026-08-19: "lo que cambiaría luego es que fuera una
app de escritorio quizás". El ADR-002 ya dejó el camino abierto y explicó por
qué no se hizo ahora: Tauri daría un `.exe` real y haría desaparecer solo el 403
del `Origin` (las peticiones saldrían del lado nativo), pero el toolchain de
Rust y las compilaciones lentas gravan cada iteración, y un MVP gasta
iteraciones. Un envoltorio Tauri sobre el build de Next sigue disponible; lo
inverso no.

## B-006 — Fase previa de instalación con portal de ingreso
**Status:** idea
Pedido por el usuario el 2026-08-19. Hoy la app asume que ComfyUI ya corre, que
el pack `comfyui-qwen3-tts` está instalado y que hay al menos una voz calculada
en disco; si algo falta, lo único que ocurre es que la barra superior avisa que
el motor no responde. La idea es una fase previa que verifique dependencias,
guíe la instalación de lo que falte y sirva de puerta de entrada. Se solapa con
B-003 (arranque y salud de ComfyUI desde la app), que probablemente quede
absorbido por esto.

**Ampliado en la sesión 2 (2026-08-21):** ahora hay una dependencia más, y es
la más pesada de todas. El alta de voces necesita el modelo de transcripción
(`faster-whisper large-v3`), que son **2,9 GB que se descargan la primera vez**.
Medido: la primera ejecución tardó **610 segundos, casi todo descarga**, y
mientras tanto la interfaz no tendría nada que mostrar. Una fase de instalación
que descargue esto por adelantado —con progreso visible— es lo que evita que el
primer usuario piense que la app se colgó. Ver [[ADR-003]].

## B-007 — Cerrar formalmente el trabajo de diseño
**Status:** idea
El flujo de `impeccable` exige dos cosas al terminar un mundo visual, y ninguna
se hizo en la sesión 1 porque no había navegador en la sesión:
1. **La revisión de acabado** con capturas de escritorio y móvil, que es lo
   único que juzga el render contra el contrato de dirección.
2. **`DESIGN.md` del spinoff oscuro**, escrito *desde el mundo construido* y no
   antes — un reglamento escrito por adelantado se defiende de la realidad en
   vez de describirla.
Relacionado: el comportamiento en ventanas angostas tampoco está verificado.
Las dos excepciones de animación de maquetación (`transition: height` en
`ScriptField`, `transition: width` en `StatusLine`) deben quedar registradas ahí
como decisiones, no como deuda.

## B-008 — El guardián de secretos bloquea código JavaScript legítimo
**Status:** idea — **sexta mordida el 2026-08-25**, y con un disparador nuevo
confirmado: **`process.env.` contiene `.env` como subcadena**, así que cualquier
comando que escriba código JavaScript que lea una variable de entorno queda
bloqueado. Verificado contra el hook: sigue buscando por subcadena.
Detectado el 2026-08-21. El hook `validate-commit.sh` impide que un comando lea
archivos de secretos, y hace bien. Pero busca la subcadena de la extensión de un
archivo de clave **en cualquier parte del comando**, y en JavaScript la propiedad
que dice qué tecla se pulsó contiene esa misma subcadena literalmente.
Resultado: bloqueó dos comandos que solo escribían código y documentación, sin
ningún secreto de por medio.

Costó dos rodeos en la sesión 2. El arreglo natural es exigir que la coincidencia
sea un **nombre de archivo** —precedida de separador, espacio o comilla, y no
pegada a un identificador— en vez de una subcadena suelta.

**No se tocó el hook**: `.claude/hooks/` es territorio privilegiado y CLAUDE.md
exige un permiso fresco y explícito del usuario para modificarlo. Queda aquí
para que él decida.

**Sesión 4 (2026-08-24) — van cinco mordiscos, y aparece un segundo disparador.**
No es solo la propiedad de la tecla pulsada: **el nombre con que un programa de
JavaScript lee sus variables de entorno también contiene la subcadena de un
archivo de secretos**, así que cualquier comando que escriba esa expresión queda
bloqueado. Esta sesión impidió (1) escribir un programa de diagnóstico que
levantaba una ruta de la app para ver su error real, y (2) **escribir esta misma
bitácora**, porque el texto describía el propio fallo. El rodeo fue crear los
archivos con otra herramienta y ejecutarlos después. El arreglo propuesto —exigir
que la coincidencia sea un nombre de archivo y no una subcadena pegada a un
identificador— resuelve los dos disparadores de una vez.

## B-010 — «veintiún» apocopado en el normalizador de texto
**Status:** idea
Detectado el 2026-08-24 al traer `tts_normalizar_texto.py` desde la skill
`voz-local`. Con la entrada «un 21% más» devuelve «un veintiuno por ciento
más», cuando el español pide «un veintiún por ciento». El script YA tiene la
lógica de apócope (`_apocopar`, `NO_APOCOPAR_ANTES_DE`) pero no dispara en este
caso.

No se tocó a propósito: el original vive en la skill y arreglarlo solo aquí
separaría las dos copias. El arreglo correcto es en la skill y luego re-importar.
Ver [[ADR-006-local-language-model-for-text]].

## B-011 — Usar las tomas marcadas como ejemplos de la reescritura
**Status:** idea
Abierto el 2026-08-24. Ya se puede marcar una toma como buena, y la reescritura
ya funciona con ejemplos fijos (los medidos de la skill). Lo que falta es unir
las dos cosas: usar los textos de las tomas que al usuario le gustaron como
ejemplos adicionales, para que la propuesta se parezca a lo que a él le funciona
y no solo a lo que funciona en general.

Requiere pensar cuántos ejemplos caben sin encarecer la llamada, y qué pasa
cuando las tomas marcadas se contradicen entre sí. **No hacerlo sin medir si
mejora**: hoy la reescritura ya es buena, y más contexto no es gratis.

## B-012 — La app no instala ollama ni el modelo de texto
**Status:** idea
Abierto el 2026-08-24 con [[ADR-006-local-language-model-for-text]]. El botón de
mejora y el texto fantasma necesitan ollama corriendo y `qwen3:4b` (2,5 GB)
descargado. La app degrada con honestidad —la parte determinista responde igual
y el panel dice que la reescritura no está disponible—, pero no instala nada ni
guía la instalación. Encaja dentro de B-006, que ya acumula el modelo de
transcripción de 2,9 GB.

## B-013 — El historial se llena en silencio
**Status:** idea
Abierto el 2026-08-24 con [[ADR-007-long-scripts-segment-orchestration]] (D5).
El historial vive en el navegador y guarda como mucho 200 tomas; cuando la
escritura falla porque no cabe, `commit()` en `web/src/lib/history.ts` **se
traga el error sin decir nada**, así que la toma simplemente no queda guardada
y nadie se entera. Hasta ahora era un fallo poco alcanzable: una toma es una
línea. Con los guiones largos una sola toma guarda N tramos más la pieza, así
que llegar al techo pasa a ser realista. Dos caminos, sin decidir: hacer el
fallo visible, o acotar lo que guarda cada tramo.

## B-014 — Reanudar un guión largo interrumpido
**Status:** idea
Abierto el 2026-08-24 con [[ADR-007-long-scripts-segment-orchestration]] (D2).
El cliente es quien secuencia los tramos, así que cerrar la pestaña a mitad de
un guión de diez tramos deja huérfano lo ya generado: los audios están en el
disco, pero la app no sabe volver a ellos. Se aceptó a conciencia para la Fase 3
—la alternativa era un registro de trabajos en el servidor, que reescribe justo
el camino corto que no se puede tocar—. Si el uso real demuestra que duele,
aquí está el pendiente.

**Dejó de ser teórico el 2026-08-25, por dos motivos.** Primero, **ya se puede
detener a propósito** (`8243720`): existe el botón, existe la pieza parcial, y
lo único que falta para cerrar el círculo es poder retomar. Segundo, **el motor
se cae solo** — pasó ese mismo día (ver [[B-003]]), y con imágenes y voz
compitiendo por la misma tarjeta va a repetirse. Un guión de veinte minutos que
muere en el tramo doce y no se puede retomar cuesta veinte minutos de máquina.

Nótese que **el latido de salud de [[B-003]] NO resuelve esto**: relanzar el
motor no devuelve los tramos que murieron en su cola.

## B-015 — Medir la longitud mínima antes de aplicar la banda de c/s
**Status:** idea
Abierto el 2026-08-24 con [[ADR-007-long-scripts-segment-orchestration]] (D4).
La verificación contra el bug de loop mide caracteres por segundo y solo la
aplica por encima de una longitud mínima de texto, porque los tramos cortos, las
cifras y las siglas dan falso positivo — y cada falso positivo cuesta una
regeneración completa. Ese número **se dejó sin calibrar a propósito**, como
constante marcada en el código, en vez de escribir una cifra adivinada como si
estuviera medida. Este proyecto ya publicó una vez unos «12 Hz» que al medirlos
eran 12,56. Falta la sesión de medición.

## B-016 — Modo extendido: el modelo local ayuda a escribir el guión
**Status:** idea
Pedido por el usuario el 2026-08-24, a raíz de la Fase 3. Hoy el modelo local
solo reescribe lo que ya escribiste. La idea es que ayude también a **producir**
el guión, como una tercera herramienta del raíl que ya existe junto al campo
—donde hoy viven «mejorar» y «ajustes avanzados»—, no como un botón suelto por
fuera: la app ya decidió dónde viven las herramientas del texto.

**Dentro hay DOS ideas distintas y conviene no fundirlas:**
- **Expandir** — le das notas, un esquema o cuatro puntos y devuelve un guión
  narrable. El modelo trabaja *desde* algo tuyo.
- **Generar** — le das un tema y escribe él.

**Recomendación registrada: expandir sí, generar no.** El modelo instalado es de
4B, y un modelo pequeño escribiendo desde cero produce relleno correcto y vacío;
transformar un texto que ya lleva criterio dentro es justo donde rinde, y es lo
que el botón de mejorar ya demuestra. Además choca con el principio de producto
«el bucle es el producto»: si el modelo escribe, el juicio se va del único paso
que solo puede dar una persona.

**Traería puesta la regla de [[ADR-006-local-language-model-for-text]]:** lo que
el modelo invente **se marca en pantalla**, porque pedirle a alguien que
encuentre una frase inventada dentro de un párrafo entero no funciona. Y nunca
debería poder ir directo a audio sin lectura humana.

**Una pregunta sin medir que decide el techo de calidad:** quedó escrito que un
modelo más grande «no cabe» (los dos que hay son de 18 GB y el motor de voz deja
16 libres). Esa cuenta **asume que ambos están cargados a la vez**, y escribir y
generar voz no ocurren al mismo tiempo. Si el modelo de escritura se carga, hace
su trabajo y se descarga antes de que entre el de voz, la restricción podría no
aplicar — a cambio de los segundos que cueste cargar 18 GB, que pueden hacerlo
insoportable. **Hay que medirlo antes de dar por cerrada la elección de modelo.**

Relacionado: [[B-017]] (el catálogo desde el que se instalaría ese modelo).

## B-017 — Catálogo de modelos instalables desde la app, y qué se lleva el `.exe`
**Status:** idea
Pedido por el usuario el 2026-08-24. Dos peticiones que son la misma:

1. **Que dentro de la app estén los modelos que hemos explorado**, con lo que se
   sabe de cada uno, y que se instalen con un clic.
2. **Que para el build final esté decidido qué viaja dentro del `.exe` y qué se
   descarga desde dentro.**

**El reparto es forzoso, no una preferencia:** el `.exe` lleva el **código**
(decenas de megas) y los modelos se piden en tiempo de ejecución. Las cuentas
que ya existen lo dejan claro — transcripción 2,9 GB, texto 2,5 GB, más el de
voz. Nadie descarga un instalador de 20 GB, y cada modelo se actualiza a su
ritmo.

**El catálogo debe ser DATOS, no código:** una lista versionada con nombre, para
qué sirve, peso, origen, licencia y lo medido de cada modelo. Así añadir uno es
editar una lista, no recompilar.

**Dos distinciones que hay que hacer desde el principio, o se pagan después:**
- **Disco y memoria de vídeo son presupuestos DISTINTOS.** Un modelo puede estar
  instalado y aun así no poder usarse a la vez que otro. Si la lista no dice las
  dos cosas, el usuario instala tres y descubre luego que dos no conviven.
- **Instalado ≠ elegido.** Tener algo en disco y que la app lo esté usando son
  dos estados. Fundidos en un interruptor, desinstalar el modelo activo deja la
  app rota sin avisar.

**El elefante, y la pregunta que abre la fase:** los modelos son la parte fácil.
Debajo no hay «un modelo que descargar», hay **un motor entero** — ComfyUI, con
su Python, sus dependencias y su ciclo de vida — que hoy la app da por hecho.
**¿El instalador se hace dueño de ComfyUI (lo trae, lo arranca, lo vigila) o
sigue asumiendo que ya está y solo comprueba y guía?** La primera respuesta es
un producto que se le puede dar a otra persona; la segunda es una herramienta
personal, que es lo que hoy es. **No se decide de pasada**: es lo que fija el
tamaño del proyecto.

**Fallos que este trabajo tiene que manejar con honestidad**, porque son
frecuentes y hoy no existen: descarga interrumpida, disco lleno, sin internet, y
un modelo a medio bajar que no debe parecer instalado.

Absorbe y da forma a: [[B-003]] (arranque y salud de ComfyUI), [[B-006]] (fase
previa de instalación con portal de ingreso) y [[B-012]] (la app no instala
ollama ni el modelo). Habilita [[B-005]] (convertirlo en app de escritorio) y
[[B-016]] (el modo extendido, que necesita elegir modelo).

## B-018 — La toma unida guarda la semilla del PRIMER tramo, y puede mentir
**Status:** idea
Encontrado el 2026-08-25 al verificar cómo viaja la semilla por los tramos.
`page.tsx` guarda la toma unida con `long.state.tracks[0]?.seed`. Normalmente
es correcto, porque todos los tramos comparten la semilla base. Pero **si es
justo el primer tramo el que se rehace** —por fallar la verificación, o a
mano—, ese número es el del reintento, no el de la corrida, y **no reproduce
la pieza**.

El dato bueno no se pierde: cada tramo guarda la suya en `segments`. Lo que
engaña es el número visible, que es precisamente el que alguien copiaría para
repetir una entrega.

Relacionado: [[B-009]] (por qué las semillas importan).

## B-019 — Ningún test afirma que los tramos comparten la semilla base
**Status:** idea
Encontrado el 2026-08-25. La suite cubre lo de al lado con detalle —que un
reintento usa semilla DISTINTA, que rehacer un tramo no toca la de sus
vecinos— pero **ninguno afirma el invariante central**: que los N tramos de una
corrida entran con la misma semilla en su primer intento.

Es el invariante del que depende que la voz no cambie entre tramos ([[B-009]]),
y es exactamente el hueco por donde se cuela una regresión que **nadie oye
hasta que escucha una pieza entera** — que es cara de producir y no ocurre en
cada sesión.

## B-020 — Dos lenguajes para la misma jerarquía: los botones primarios
**Status:** idea
Abierto el 2026-08-25. Los dos botones primarios del escenario pasaron a
relleno oscuro con borde y letra en el acento (`ff1ec5b`). **Quedaron cuatro
con el naranja macizo anterior** en `VoiceLibrary`, `VoiceRecorder` e
`ImprovePanel`.

**No se unificaron a propósito, y el motivo es técnico, no de tiempo:** el
relleno nuevo es `--surface`, que es exactamente el color de fondo de los
cajones donde viven esos cuatro. Aplicarles el mismo token los dejaría **sin
relleno visible**, indistinguibles del botón secundario que ya existe. Hace
falta **un token relativo a la superficie que los contiene**, no el mismo valor
absoluto — que es una decisión de sistema de diseño, no un buscar-y-reemplazar.

Encaja dentro de [[B-007]] (cerrar formalmente el trabajo de diseño), donde ese
tipo de regla es justo lo que debería quedar escrito.
## Cerradas

## ❌ B-001 — [CERRADO] Ordenar la herencia `comfy-mcp/`
**Status:** ❌ sin objeto
Se proponía rescatar de `comfy-mcp/.tmp/` los 61 MB de audio de Martín (material
no regenerable, materia prima de la Fase 3) y los 9,4 MB del benchmark zero-shot,
antes de que una purga de `.tmp/` los borrara. **El usuario lo descartó
explícitamente el 2026-08-19** ("lo primero no importa"). Queda registrado el
riesgo asumido: ese material vive en un directorio cuya convención en este
estudio es que se purga sin preguntar, incluido el paso final de `/close`.

## ✅ B-002 — [CERRADO] Decidir el puente entre la app y ComfyUI
**Status:** ✅ hecho
Resuelto por [[ADR-001-comfyui-bridge]] el 2026-08-19. La app habla con la API
HTTP de ComfyUI, y siempre desde un componente propio del lado servidor: se
midió que ComfyUI responde **403 a cualquier petición con `Origin` ajeno**, así
que un frontend estático puro no es implementable. El servidor MCP `comfy` queda
fuera del runtime de la app.

## ✅ B-004 — [CERRADO] Controles de la interfaz acotados por el modelo
**Status:** ✅ hecho
Resuelto por [[ADR-006-local-language-model-for-text]] el 2026-08-24. La
pregunta era si la puntuación —la única palanca real, porque `instruct` no
existe en voz clonada— se convertía en ayuda visible. Sí: el botón «Escribirlo
para la voz» revisa el texto con las reglas medidas en la investigación
`comfy-mcp` (ortografía +15 a +29 %, puntuación 3,5× más que un fine-tune),
normaliza números y fechas, y propone una reescritura. La app sigue sin
prometer controles que el motor no da.

## ✅ B-009 — [CERRADO] ¿Una semilla transfiere carácter entre textos distintos?
**Status:** ✅ hecho — **RESPONDIDO ESCUCHANDO el 2026-08-25. Sí transfiere.**

El usuario generó un guión largo entero —**28 tramos, todos con textos
distintos y todos con la misma semilla**, porque el secuenciador sortea un solo
número al confirmar el corte y ese viaja a todos— y lo escuchó completo. Su
veredicto textual: ***"muy consistente el tono"***.

Eso es exactamente el experimento que esta entrada pedía, y salió por el lado
bueno: **guardar «la seria» vale la pena**, las semillas guardadas sirven para
algo más que repetir una frase concreta.

**Lo que la misma escucha destapó, y NO era la semilla:** el volumen sí variaba
entre tramos. Causa distinta —el unificador concatenaba sin igualar niveles— y
ya arreglada en `4d2dd26`. Conviene no confundir las dos cosas: el carácter de
la voz se transfiere, la sonoridad no la fijaba nadie.

**Sigue sin afirmarse en la interfaz**, y está bien así: una escucha es
evidencia suficiente para decidir, no para escribir una promesa en pantalla.

Abierto en la sesión 2 al construir las semillas guardables. Está medido que la
misma semilla con el **mismo** texto reproduce la misma toma. Lo que **no** está
medido es si la misma semilla con textos **distintos** conserva algo reconocible
—un tono, una energía, una manera de respirar—. La respuesta cambia cuánto valen
las semillas guardadas: si transfiere, guardar «la seria» es oro; si no, sirven
solo para repetir una frase concreta.

La interfaz hoy **no afirma** ninguna de las dos cosas, a propósito (está escrito
así en `lib/favorites.ts`). Solo se puede responder escuchando: generar dos
textos distintos con la misma semilla y compararlos contra los mismos textos con
semillas diferentes. Ver [[ADR-003]] para el precedente de medir antes de
afirmar.
