# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué pidió el usuario,
> acciones, decisiones (con alternativas descartadas), resultados y próximos
> pasos.

## 2026-08-21 — La app aprende a escuchar: alta de voces nuevas

<!-- cierre -->
## 🧾 Cierre — Sesión 2 · 2026-08-21

**En una frase:** la app dejó de tener una sola voz de por vida — ahora tomas un
audio de alguien, la app entiende qué dice, tú corriges lo que haga falta, y esa
persona queda disponible como voz para siempre.

**Qué se hizo**
- Se leyó el código real del motor para averiguar cómo se da de alta una voz, en
  vez de suponerlo. Resultado: el motor pide el audio **y además el texto de lo
  que se dice en él**.
- Se descubrió que en esta máquina no hay nada instalado que sepa escuchar un
  audio y escribir lo que dice, así que hubo que añadirlo.
- Se construyó esa pieza: un programa que escucha el audio y escribe el texto.
  Corre en el procesador, sin robarle la tarjeta gráfica al motor de voz.
- Se escribió todo el lado servidor del alta: subir el audio, transcribirlo,
  dejar que el usuario corrija el texto, y crear la voz.
- Se probó con los audios reales de Andrés y se comparó contra el texto que
  produjo la voz que ya se usa a diario. Es la comparación más exigente
  disponible.
- Se añadió un verificador automático para un error que ningún test podría ver.
- Se probó todo contra el motor encendido, y ahí apareció un fallo que solo se ve
  así: un alta que terminaba bien se quedaba diciendo «en cola» para siempre.
  Se corrigió, se buscó el mismo fallo en el resto de la app —estaba— y se
  cerraron los dos.
- Se construyó la pantalla: un cajón en el borde izquierdo, gemelo del de
  «Tomas» que ya existía en el derecho. Izquierda es lo que entra, derecha lo
  que sale.
- Se añadieron las **opciones avanzadas** al escenario: la semilla (con poder
  fijarla, tirarla de nuevo y **guardarla con nombre** para volver a ella), el
  idioma y el techo de longitud. Ni una más: son exactamente las tres que el
  motor acepta.
- Se añadió **borrar de verdad**, tanto voces como generaciones: el archivo
  desaparece del disco, no solo de la lista.
- Se añadió **grabar la voz con el micrófono**, con un guión en pantalla para
  leer en voz alta. Hay tres guiones, en tres tonos distintos.
- Se quitó **el último control con aspecto del sistema operativo** que quedaba
  en la app: ahora todos los desplegables son el mismo componente propio.
- **El audio de referencia se borra solo** en cuanto la voz queda creada: ya no
  hace falta, y es la grabación de una persona.

**Qué se decidió y por qué**
- **Escuchar el audio se hace en la app, no dentro del motor.** La alternativa
  era instalar un complemento de terceros en el motor; se descartó porque
  cargaría en la misma tarjeta gráfica donde vive la voz, y porque son
  proyectos ajenos con mantenimiento incierto. Queda como ADR-003.
- **El usuario corrige el texto antes de crear la voz, y esto no es opcional.**
  La prueba lo demostró: en el clip corto, el programa escribió *"Andrea"* donde
  el audio decía *"Andrés"* — el nombre del propio hablante. Sin ese paso de
  corrección, la voz se habría fabricado contra un texto que nombra a otra
  persona. Con un clip más largo acertó, así que más contexto ayuda; pero no
  garantiza.
- **El usuario descartó escribir el texto a mano**, que era la opción sin
  instalar nada. De ahí salió todo lo demás.
- **Se eligió el modelo grande y se midió antes de afirmar nada.** Tarda 27
  segundos para medio minuto de audio, una sola vez por voz. Aceptable, así que
  se queda.
- **Un cajón lateral y no una ventana emergente.** Dar de alta una voz no
  interrumpe nada ni necesita robar la atención, así que no para la pantalla.
- **La espera se cuenta, no se adivina.** Se muestra el tiempo que lleva
  esperando, que es un hecho, en vez de una barra de progreso inventada. Y si
  pasa de 45 segundos aparece la explicación de la descarga inicial: la
  información llega cuando hace falta y no antes.
- **Para borrar de verdad, la app tuvo que empezar a tocar los archivos del
  motor.** Se comprobó que ComfyUI no ofrece ninguna forma de borrar por su
  cuenta: su única ruta de borrado alcanza solo su carpeta de ajustes. La
  alternativa era esconder las cosas y dejar el disco llenándose, que es
  mentirle al usuario. Queda como ADR-004, con la parte de seguridad medida y
  probada.
- **Nada de ventanas del navegador para preguntar.** Ni para nombrar una
  semilla ni para confirmar un borrado: se hace dentro de la propia pantalla,
  porque este proyecto ya había reemplazado el desplegable del sistema justo
  para no traer ese aspecto ajeno.
- **Al grabar, el guión es la función y no el botón.** Con un botón de grabar a
  secas uno dice «hola, probando» y para, y la voz clonada suena a eso. Un
  párrafo preparado da medio minuto de habla normal. Y como el texto se conoce
  de antemano, la transcripción sale casi perfecta.
- **Un solo desplegable para toda la app.** En vez de maquillar el de idioma, se
  generalizó el que ya se había construido para las voces. Había que elegir
  entre tener uno bien hecho o dos a medias.
- **El audio de referencia se borra al terminar, y la pantalla lo dice.** Borrar
  algo del disco no puede ser una sorpresa, aunque sea lo correcto.

**Estado al cerrar:** rama `main` · **7 commits hechos** · **60 tests
en verde, ninguno saltado** · tipos, lint y compilación limpios · los **dos**
verificadores de costura en verde · el detector de diseño sin hallazgos. El alta
de voz se ejecutó **de principio a fin contra el motor real** y creó una voz
nueva; los tres borrados de archivos se verificaron contra el disco real con
señuelos, sin tocar nada del usuario. El usuario ya probó en el navegador la
biblioteca de voces y las opciones avanzadas, y las aprobó.

**Siguiente paso concreto:** reiniciar la app y probar lo último que no ha visto
nadie: grabar una voz leyendo el guión, y el desplegable de idioma ya sin el
aspecto del sistema operativo.
<!-- /cierre -->

**Time:** 14:40 (aprox.)

**User request:** empezar la sesión con `/start`, y tras el briefing elegir la
Fase 2 (alta de voces). Ante la pregunta de de dónde sale la transcripción del
audio de referencia, el usuario pidió primero una explicación en lenguaje llano
y después eligió la opción de transcribir automáticamente. También preguntó si
el proyecto se podría portar a Tauri más adelante.

### Actions taken
- `/start`: andamiaje completo verificado, sin acción. Briefing sintetizado sin
  delegar (todo el estado ya estaba leído; fanear habría sido gasto puro).
- Se leyó el código fuente del pack `ComfyUI-Qwen3-TTS` y de `server.py` de
  ComfyUI para extraer la cadena real de alta de voz, en vez de recordarla.
- Se verificó en PyPI que `faster-whisper` no arrastra PyTorch.
- Se creó el entorno de Python del proyecto (`uv`, `pyproject.toml`) — el
  primero que tiene este proyecto.
- Se escribieron: `execution/transcribe_audio.py`, `web/src/lib/transcribe.ts`,
  `web/src/lib/voices.ts`, `POST /api/voices/transcribe`, `POST /api/voices`,
  `web/tests/voices.test.ts` y `execution/check_trim_contract.py`.
- Se consultaron los docs de Next 16 incluidos en `node_modules` antes de dar
  por buena la forma de los route handlers.
- Se midió la transcripción contra dos clips reales, comparando con el
  `ref_text` guardado en la metadata de la voz `andres_bobe.safetensors`.

### Decisions
- **ADR-003 — la transcripción vive en la app.** Razones y alternativas
  descartadas en el propio ADR.
- **El número del recorte es un contrato entre dos lenguajes.** El motor recorta
  el audio de referencia a 30 s antes de calcular la voz. Si la transcripción
  cubriera 60 s, describiría audio que el modelo no escuchó, y **nada fallaría**.
  Se decidió recortar en la app y pasar el mismo número al motor, y se escribió
  un verificador determinista (`check_trim_contract.py`) porque es exactamente
  la clase de fallo silencioso que CLAUDE.md manda blindar.
- **Se quitó un `maxDuration` que no hacía nada.** Sus propios docs dicen que lo
  fija la plataforma de despliegue, así que en una app local es decorativo.
  Dejarlo habría hecho creer que existe un límite que no existe.
- **La constante compartida se movió de `transcribe.ts` a `voices.ts`**, porque
  el grafo es quien impone el límite — y así `voices.ts` deja de arrastrar
  `child_process` a todo el que lo importe.

### Outcomes
- 17 tests en verde (antes 7). Los nuevos incluyen seis de seguridad sobre el
  saneado del nombre: `Qwen3SavePrompt` construye su ruta sin sanear nada, así
  que un nombre con `..` escribiría fuera del directorio de voces.
- Transcripción medida: 16,2 s para 10,6 s de audio; 26,9 s para 30 s. Dos
  corridas del mismo clip devolvieron texto idéntico.
- Precisión medida contra la verdad guardada: 2 errores en 33 palabras en el
  clip corto (uno de ellos, el nombre del hablante), 0 en el de 30 s.
- La descarga del modelo resultó ser de **2,9 GB** y tardó ~10 minutos. Se
  anotó en B-006 porque es lo que haría pensar a un usuario nuevo que la app se
  colgó.
- Se guardó una memoria nueva ([[nextjs-maxduration-does-nothing-locally]]) con
  el gotcha de la configuración de rutas de Next, indexada en `MEMORY.md`.

### Segunda mitad — validación contra el motor y la pantalla
El usuario levantó ComfyUI y pidió validar antes de implementar la interfaz.

- **La cadena completa funcionó a la primera** contra el motor real: subir el
  audio (27 s de transcripción), corregir, crear. La voz nueva apareció en disco
  y en el selector sin tocar nada más.
- **Se encontró un bug real que solo aparece contra el motor.** Un alta de voz
  termina con éxito pero **sin audio de salida** (guarda un archivo, no genera
  sonido). La lectura de estado solo consideraba «terminado» si encontraba
  audio, así que un alta exitosa se reportaba **«en cola» para siempre**. La
  generación normal nunca lo destapó porque siempre produce audio.
  - Se añadió el estado `finished` y se verificó contra el motor vivo.
  - **Se barrió la clase del bug:** la página tenía el mismo agujero al otro
    lado (se habría quedado girando), y también se cerró.
  - Se blindó con 4 tests nuevos usando como fixture la respuesta real que
    devolvió el motor, para que no pueda volver.
- **Se unificó un import** (`./comfy` → `./comfy.ts`) que impedía probar
  `tts.ts` con el runner — la misma clase de problema ya corregida en
  `voices.ts`.
- **La pantalla:** `VoiceLibrary.tsx`, una bandeja en el borde **izquierdo**,
  simétrica a la de «Tomas» del derecho. Izquierda es lo que entra (las voces),
  derecha lo que sale (las tomas).
  - Se cargó la suite de diseño obligatoria y el contexto de `impeccable` antes
    de escribir nada, y se heredó el mundo visual del código existente.
  - **Cajón, no ventana modal**: dar de alta una voz no interrumpe nada.
  - **La espera se cuenta, no se predice:** un contador de tiempo transcurrido
    real. Y si pasa de 45 segundos, aparece la explicación de la descarga de
    2,9 GB — información cuando hace falta, silencio cuando no.
  - Detector de diseño: sin hallazgos.

### Tercera parte — opciones avanzadas y borrado real
El usuario aprobó la pantalla («me gusta mucho cómo se ve»), preguntó si la voz
de prueba era Bobe duplicado (sí lo era), y pidió opciones avanzadas con
semillas etiquetables, más poder borrar voces **y** generaciones de verdad del
disco.

- **Se verificó qué expone el motor antes de ofrecer nada.** Leyendo el nodo:
  solo `seed`, `language` y `max_new_tokens`. No hay temperatura, velocidad,
  emoción ni tono. Se expusieron esos tres y ninguno más.
- **Semillas guardables**, con nombre, edición en línea y reutilización de un
  clic (`lib/favorites.ts` + `components/AdvancedPanel.tsx`). Se dejó escrito en
  el código lo que una semilla guardada **no** promete: que el mismo número dé
  el mismo carácter en textos distintos no está medido, así que la interfaz no
  lo afirma.
- **Borrado real** (ADR-004): `lib/comfy-files.ts` es el único módulo que toca
  el sistema de archivos, con dos directorios permitidos y comprobación de que
  cada ruta resuelta cae dentro de ellos. Rutas `DELETE` para voces y para
  tomas. Verificado contra disco real con un archivo señuelo, sin tocar nada
  del usuario.
- **Un test encontró un bug de verdad:** `Number(null)` es `0`, no `NaN`, así
  que un techo de longitud ausente se colaba como cero y acababa clampado al
  mínimo. Se arregló la función, no el test.
- **Se escribió un segundo verificador de costura**
  (`execution/check_engine_options.py`): compara los rangos e idiomas que ofrece
  la interfaz contra los que declara el nodo. El pack se actualiza por su
  cuenta, y sin esto la primera señal de que cambió sería una generación
  rechazada. Se comprobó además que detecta un desacuerdo, no solo que pasa.
- **Falso positivo del hook de seguridad, anotado como B-008:**
  `validate-commit.sh` bloqueó dos comandos por contener la subcadena que forma
  `e` + `.key` en JavaScript, confundiéndola con un archivo de clave. No se tocó
  el hook: es territorio privilegiado y requiere permiso explícito.

### Cuarta parte — grabar por micrófono, y quitar el chrome del sistema
El usuario probó lo anterior en el navegador («funciona», «me gusta mucho cómo
se ve») y pidió tres cosas más.

- **Grabar la voz desde el micrófono, con un guión en pantalla para leer.** El
  guión es la función, no el botón: con un botón de grabar a secas uno dice
  «hola, probando» y para, y así suena el clon. Tres guiones en tres tonos,
  porque cómo se lee se traslada a cómo suena. Hay tests que comprueban que
  cada guión cubre la erre fuerte, la ñ, la ll, la jota, una pregunta y mezcla
  de frases largas y cortas; **uno falló y se reescribió el guión, no el test**.
- **Se convierte a WAV en el navegador.** El navegador no graba wav (Chrome da
  webm/opus, Safari mp4), así que lo que llegara al motor dependería de con qué
  navegador se grabó. Se decodifica y se reescribe como PCM, sin remuestrear:
  bajar la calidad serviría para transcribir y sería un desperdicio para la
  huella, que sale del mismo archivo.
- **Fuera el último control nativo.** El usuario mandó una captura del
  desplegable de idioma con el aspecto del sistema operativo. Se generalizó el
  listbox que ya existía para las voces a `components/Select.tsx`, y ahora hay
  **uno solo** en todo el proyecto. `VoiceSelect` pasó a ser una capa fina
  encima, sin cambiar su API. El campo numérico del techo también perdió sus
  flechitas nativas.
- **El audio de referencia se borra al crear la voz.** Lo había señalado como
  hallazgo de privacidad y el usuario lo aprobó. Era urgente justamente por la
  grabación: sin esto, cada alta dejaría otra grabación de una persona en el
  motor para siempre. El directorio `input` es el más delicado de los tres
  —contiene archivos que puso el usuario— así que se probó explícitamente que
  no se puede alcanzar desde él ni una voz ni una toma.

### Next steps / open questions
- **Falta ver en el navegador la grabación y los desplegables nuevos.** La app del usuario corre un
  build anterior; hay que reiniciarla. Esto es lo único que juzga el acabado.
- Quedó una voz de prueba (`voz_de_prueba.safetensors`) creada durante la
  validación. **Ahora sí se puede borrar desde la interfaz** — el usuario
  eligió esa vía en lugar de que se borrara por detrás.
- La Fase 2 pide además **procedencia visible** de cada voz (son personas
  identificables). Sigue sin hacerse.
- Sin medir: si una misma semilla transfiere carácter entre textos distintos.
  Es lo que decide cuánto valen realmente las semillas guardadas, y solo se
  puede juzgar escuchando.
- La pantalla de alta de voz no existe. Debe pasar por la suite de diseño
  obligatoria.
- `npm start` no comprueba ni crea el entorno de Python. Encaja con B-006.
- Sigue abierto de la sesión 1: ventanas angostas y B-007.

## 2026-08-19 — De carpeta vacía a una app que genera voz

<!-- cierre -->
## 🧾 Cierre — Sesión 1 · 2026-08-19

**En una frase:** TTS Studio nació entero en una sola sesión: de carpeta vacía a
una aplicación que genera voz clonada, con su arquitectura decidida, su diseño
propio y su documentación al día.

**Qué se hizo**
- Se levantó el proyecto desde cero: no existía nada, ni siquiera el repositorio.
- Se definió qué es: una app de escritorio-en-navegador, de un solo usuario, que
  convierte texto en voz clonada usando el motor que ya estaba instalado en esta
  máquina.
- Se midió un límite de ComfyUI que decidió toda la arquitectura: rechaza
  cualquier petición que venga de otra página, así que la app necesita un
  componente propio de servidor que hable con él.
- Se construyó la aplicación completa: la pantalla, el motor de fondo animado,
  el reproductor con forma de onda, el selector de voz y el historial.
- El usuario la usó, generó voz real y aprobó el resultado.
- Se le pasó una auditoría técnica y se corrigieron sus siete hallazgos, más
  tres bugs de animación que solo aparecieron usándola.
- Se dejó todo arrancable con un solo comando y documentado en el README.

**Qué se decidió y por qué**
- **App con interfaz**, no un conjunto de scripts ni un laboratorio de
  entrenamiento: el objetivo es usarla a diario. Se descartaron ambas.
- **Motor local**, porque ya estaba instalado y validado, no cuesta por uso y la
  voz nunca sale de la máquina. Se descartaron las APIs de pago y el híbrido.
- **Next.js sobre Tauri**, aunque Tauri daría una app de escritorio de verdad:
  su cadena de compilación grava cada iteración y un MVP gasta iteraciones.
  Tauri sigue disponible como envoltorio más adelante (anotado en la lista de
  pendientes).
- **El botón principal lleva tinta oscura sobre naranja**, al revés que el
  sistema de marca: se midió que el blanco no alcanza el contraste mínimo.
- **No se inventan medidores de progreso.** Mientras el motor trabaja no hay
  nada medible, así que la interfaz dice en qué punto de la cola está y no
  finge una barra.

**Estado al cerrar:** rama `main` · árbol limpio · 27 commits · 7 tests en verde
(2 contra el motor real) · compilación correcta · detector de diseño sin
hallazgos salvo dos excepciones documentadas a propósito. Nada a medias.
Sin verificar: el comportamiento en ventanas angostas, porque no hubo navegador
en la sesión para probarlo.

**Siguiente paso concreto:** empezar la Fase 2 dando de alta voces nuevas —
añadir una ruta en `web/src/app/api/voices/` que acepte un audio de referencia,
lo escriba en la carpeta `input` de ComfyUI y calcule el prompt de voz con el
nodo `Qwen3PromptMaker` (ya está instalado en el motor, verificado). Hoy solo
existe *Andres Bobe* porque estaba calculada en disco.
<!-- /cierre -->

**Time:** sesión larga, un solo tramo.
**User request:** `/start` → definir el proyecto → primer commit → decidir stack, roadmap y dirección visual → construir.

### Actions taken
- **Andamiaje (paso 0 de `/start`):** trío `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`, `git init` + `.gitignore`, las cuatro living docs, `production/session-state/`, `memory/`, `execution/`, `.tmp/`.
- **Verificación de skills** contra `global-skills-map.md` leyendo `~/.claude/skills/` directamente: 83 carpetas, las 7 obligatorias y las 22 recomendadas presentes, sin drift.
- **Evidencia sobre ComfyUI**, no supuestos: `server_info` (corriendo, 0.33.0, pack qwen3-tts 1.7.0, RTX 5090 con 23,9 GB) y una batería de `curl` que aisló la cabecera `Origin` como única variable del 403.
- **Búsqueda del sistema de diseño** que el usuario mencionó: encontrado como **CRTIC clean** (contrato en `DESIGN.md` + kit ejecutable, replicado en doce proyectos; la copia canónica es la del 2026-07-06). Encontrada también su biblioteca de componentes animados repartida en cuatro carpetas `Componentes/`.
- **Flujo de `impeccable`:** `context.mjs` → `init` (entrevista de tres preguntas + `PRODUCT.md`) → `new-work`, que clasificó el trabajo como superficie nueva dentro de un mundo establecido, no como mundo nuevo. Siete estructuras derivadas y `concept-seed.mjs --scope surface --mode operate` asignó la número 5 (semilla `5006a149`).
- **Tres bocetos generados** con `t2i_qwen_lightning` en el ComfyUI local, revisados y presentados al usuario, que confirmó la dirección asignada.
- **Fase 0 construida:** `create-next-app` en `web/` (Next 16.3.1, React 19.2.8, Tailwind 4, Geist ya cableado), capa de tokens oscuros en `globals.css`, `src/lib/comfy.ts` con el saneador de cabeceras como función pura, y el proxy en `src/app/api/comfy/[...path]/route.ts`.
- **Contrastes calculados**, no estimados, para los cinco colores del sistema oscuro sobre los tres niveles de superficie.

### Decisions
Ver el bloque de cierre y los dos ADRs. Además:
- **El código vive en `web/`**, no en la raíz: la raíz ya está ocupada por el andamiaje del estudio y `create-next-app` habría chocado con `CLAUDE.md` y `directives/`.
- **Se omitió el fan-out a `producer` y `doc-keeper`** del paso 3 de `/start`: sobre un proyecto recién scaffoldeado habrían sintetizado archivos creados un minuto antes.
- **B-001 (rescatar el audio de `comfy-mcp/.tmp/`) se cerró como descartado por el usuario**, dejando registrado el riesgo asumido.

### Outcomes
- `PRODUCT.md`, `ADR-001` (puente a ComfyUI), `ADR-002` (stack), roadmap con seis fases y el MVP delimitado, backlog con dos abiertas y dos cerradas.
- Fase 0 terminada y verificada: 7 tests en verde (2 contra el motor real), build de producción correcto, y una petición con `Origin` de navegador atravesando el proxy y devolviendo 200 con datos reales de ComfyUI.

### Fase 1 — lo construido
- `AudioField` — el campo de audio vivo, descendiente oscuro del `PlotFieldBg` de CRTIC. Respeta movimiento reducido pintando **un** fotograma y sin registrar oyentes.
- `Waveform` — picos decodificados del audio real con Web Audio, y hace de transporte (clic para saltar).
- `useHistory` — store externo sobre localStorage, para que leerlo tras montar no sea un `setState` dentro de un efecto.
- Rutas `/api/voices`, `/api/generate`, `/api/status/[promptId]`, todas sobre el proxy del ADR-001.
- **El contrato de dirección se estaba borrando entero:** React descarta los comentarios JSX y nunca llegan al HTML. Se reescribió como comentario HTML real y se verificó greppeando la página servida.
- Se mató un proceso Node huérfano que ocupaba el puerto 3000 desde una prueba anterior: `TaskStop` mata el envoltorio, no el hijo.

### Auditoría (al final de la sesión)
Siete hallazgos, todos medidos o greppeados, no supuestos. Todos corregidos:
- **Faltaba `color-scheme: dark`**, así que el desplegable nativo del selector, las barras de scroll y el autocompletado salían en cromo claro sobre página oscura.
- **El placeholder del textarea medía 2,66:1**: llevaba opacidad 55% sobre un token que ya era tenue, y las dos atenuaciones se multiplicaron.
- **La página no tenía ni un encabezado.** El nombre del producto pasó a ser el `h1`.
- **La bandeja cerrada seguía siendo tabulable** — con teclado se entraba en un panel invisible. Ahora lleva `inert` y se cierra con Escape.
- **El bucle del canvas no paraba nunca**, ni en segundo plano. Importa más aquí que en una web normal: la misma GPU corre la inferencia que el usuario está esperando.
- **El bloque de movimiento reducido era un exterminio global de 0,01ms**, que mata también la retroalimentación de los controles. Ahora sobreviven color, opacidad y sombra; se elimina el movimiento.
- Objetivos táctiles bajo 44px, y una referencia escrita durante el render.

### El lanzador (final de la sesión)
`npm start` en la raíz reemplaza los tres pasos manuales y la pestaña del
navegador. Probado en sus dos caminos: con el puerto libre, y con un servidor
anterior todavía vivo (lo detectó, comprobó que era nuestro y lo cerró).

**Un error propio en el camino:** intenté quitar un aviso de Node llamando a
`npm.cmd` directamente en vez de con shell, y lo rompí del todo — desde la
mitigación de CVE-2024-27980, Node se niega a lanzar archivos `.cmd` sin shell.
Encima me había tragado el error, así que el fallo salió mudo. La solución real
fue saltarse npm y llamar al binario de Next por Node: sin `.cmd`, sin shell, y
sin el aviso. Lección aplicada al código: el lanzador ahora reporta
`res.error` y el código de salida en vez de un mensaje genérico.

### Correcciones visuales (final de la sesión)
Referencia usada para la forma del selector: `Componentes/AI-Chat-Box.md`, que el
usuario aportó. Se tomó su **gramática** (botón + panel flotante + resaltado que
sigue al cursor) pero **no sus tokens ni su curva**: la referencia rebota con
sobrepaso y el sistema de la casa prohíbe el rebote.

- **El anillo de foco naranja** caía sobre el textarea, donde no informa nada
  (el cursor ya te dice que estás escribiendo) y a ese tamaño se vuelve el
  objeto más ruidoso de la pantalla. Ahora los anillos son para lo que se
  acciona; los campos de texto expresan el foco a través de la superficie que
  los contiene.
- **El `<select>` nativo** dibujaba el menú del sistema operativo sobre una
  superficie que no tiene nada de eso. Se reemplazó por un listbox propio, y
  **rehecho entero**: un selector a medida sin accesibilidad sería peor trato
  que el control feo que sustituye, porque el nativo traía el teclado gratis.
  Flechas, Home/End, Enter, Espacio, Escape, Tab, clic fuera, y los roles.
- **El fondo que se pegaba lo causó el propio arreglo de la auditoría.** Pausar
  el bucle con la pestaña oculta mientras el tiempo se leía de `performance.now()`
  hace que el reloj avance aunque el campo no: al volver, el primer fotograma
  salta a donde "debería" estar. Se ve como congelarse y brincar. Ahora el tiempo
  se acumula por deltas acotados, así que pausar no cuesta nada.
- De paso, tres costos por fotograma: el foco de luz componía todo el lienzo
  cuando su degradado llega a cero mucho antes del borde; cada curva se muestreaba
  dos veces (relleno y trazo); y los degradados de capa se reconstruían cuatro
  veces por fotograma en vez de una por redimensionado. DPR acotado a 1,5.

### El área de escritura
De la referencia se tomaron sus **dos comportamientos útiles** y se descartó el
tercero: la expansión desde píldora cerrada no aplica, porque la referencia es
un chat que empieza plegado y este escenario está siempre abierto.

- **Crece con el contenido.** Estaba fija en cinco filas: una línea reservaba
  cinco, y un guión largo se leía por una ranura. Ahora mide y anima entre un
  piso de cuatro líneas y un techo, pasado el cual hace scroll.
- **Desvanecidos en los bordes**, en el color de la propia tarjeta, que aparecen
  solo cuando hay algo más allá del borde. Un corte duro se lee como que el
  texto termina ahí.
- Altura y opacidades van **directo al DOM**. Como estado costarían un re-render
  por pulsación para fijar un estilo que un efecto fija solo, y volverían a
  chocar con la regla de `setState` dentro de efectos que la auditoría ya limpió.
- **Excepción documentada:** el detector marca `transition: height` como
  animación de maquetación y tiene razón. No hay sustituto válido aquí —
  `transform` deforma el texto y `grid-template-rows` anima maquetación igual,
  además de quitarle al textarea la altura explícita que necesita para
  desplazarse en el techo. El costo está acotado: se dispara al cambiar el
  número de líneas, no por pulsación, y el lienzo de fondo es `fixed`, así que
  no se re-maqueta con él.

### La línea de estado
Bajó a compartir fila con la etiqueta del campo: qué es esto a la izquierda, qué
está haciendo el motor con ello a la derecha. El estado pertenece a la toma que
estás haciendo, no a la app.

- Usa el `MorphingText` de la referencia: el ancho se anima entre un texto y
  otro y la palabra nueva entra con una subida de 3px. Sin sobrepaso — un
  bamboleo al lado de un campo donde se escribe distrae de escribir.
- **No se trajeron las cinco barras reactivas de la referencia.** Allí
  visualizan un nivel de micrófono real; aquí no existe nada medible mientras
  ComfyUI trabaja (informa en cola y ejecutando, no progreso), así que serían un
  indicador de carga disfrazado de medidor, en contra de la regla del propio
  producto de mostrar la espera con honestidad. La posición en cola es la
  información real.
- Mover el estado destapó **dos duplicaciones**, ambas corregidas: el mensaje de
  fallo salía en la línea y en la alerta de abajo, y "Generando" estaba también
  en el botón. Ahora la línea nombra el estado, la alerta lleva el mensaje, y el
  botón no se renombra a mitad de acción (cambiaba de ancho bajo el cursor sin
  aportar nada).
- La barra superior conserva la salud del motor —que sí es de la app— y **no
  muestra nada mientras ComfyUI responde**: una luz verde permanente es ruido, y
  su ausencia es lo que hace que el aviso se note cuando aparece.
- **Segunda excepción documentada de animación de maquetación** (`transition:
  width`), razonada en el archivo igual que la primera.

### Dos bugs que el usuario vio y yo no
Los dos venían de código propio, y ninguno se detectaba con tipos, lint, build
ni el detector de diseño: solo mirándolo funcionar.

- **El área de escritura apenas se movía.** `height` estaba en el estilo inline
  de React, así que React reaplicaba el piso en **cada render** — cada pulsación
  reseteaba la caja a 132px y el efecto la volvía a subir, repitiendo la
  animación entera por carácter. El piso pasó a ser una clase, que React no
  disputa, y la altura medida la escribe solo el efecto.
- **El foco era invisible**, que era la otra mitad de "no pasa nada al pinchar":
  la primera versión movía el borde al token de filete, una diferencia de 1,1:1
  contra esa superficie. Técnicamente un cambio, visualmente nada. Ahora el
  campo tiene filo en reposo, aclara al pasar el cursor y sube claro al enfocar.
- **Las pelotitas se trababan** porque la que lleva el halo se elegía por su
  índice en un bucle que arranca en un desplazamiento con módulo: al dar la
  vuelta, el conjunto se corría y ese índice pasaba a ser otra pelotita física.
  La destacada se teletransportaba una vez por ciclo. Ahora las normales son
  intercambiables y la destacada tiene posición propia continua, cuya vuelta
  ocurre fuera del lienzo.
- **Tirón rítmico de fondo:** cuatro arrays de puntos y un degradado radial
  nuevos sesenta veces por segundo son basura constante, y el recolector la paga
  en pausas visibles. Los buffers son `Float64Array` construidos una vez por
  redimensionado, y el degradado del foco se crea en el origen y se mueve con
  `translate()`.

**Lección para la próxima sesión:** todo esto pasó las cuatro comprobaciones
automáticas. Lo único que lo encontró fue el usuario usándolo.

### El escenario plegable
Es el comportamiento de la referencia que un commit anterior **descartó a
propósito**, argumentando que este escenario está siempre abierto. El usuario lo
pidió, y es su producto.

- Las dos mitades se pliegan con `grid-template-rows` (1fr→0fr la línea plegada,
  0fr→1fr el cuerpo). Es la técnica que el detector recomienda en vez de animar
  `height`, así que **no añadió una tercera excepción**: siguen siendo dos.
- **Volver a plegarse es conservador a propósito:** solo si está vacío, no hay
  toma generada y no hay nada en vuelo. Plegar sobre una toma terminada
  escondería el reproductor y la descarga. Una toma recuperada de la bandeja
  abre el escenario por la misma razón.
- El clic que abre también pone el cursor. Pedir un segundo clic para empezar a
  escribir es de las cosas que dejan una interacción a medias.
- El `max-width` y el `padding` de la tarjeta sí animan maquetación, y es
  deliberado: un momento discreto que el usuario pidió con un clic, no algo que
  corra por fotograma.

### Careo del cierre
- **Checkers de costura:** ninguno todavía (`execution/check_*.py` no existe —
  el proyecto aún no tiene código Python).
- **Hooks del harness:** entraron en el commit de andamiaje y **no se
  modificaron después**, verificado con `git log 12d5481..HEAD`. Su suite de
  tests no aplica a esta sesión.
- **Archivo tocado sin mencionar:** `Componentes/AI-Chat-Box.md` viajó dentro
  del commit `8a267a4`, cuyo mensaje no lo nombra. Lo aportó el usuario como
  referencia de diseño y un `git add -A` lo barrió. Es benigno y está
  explicado, pero queda registrado: un cambio colateral sin explicar es un
  misterio que hereda la sesión siguiente.
- **Planeado y no hecho:** B-001 (rescatar el audio de `comfy-mcp/.tmp/`),
  descartado explícitamente por el usuario con el riesgo asumido por escrito.

### Next steps / open questions
- **Fase 2, la biblioteca de voces:** dar de alta una voz nueva desde audio de referencia. Es lo que convierte esto en herramienta y no en demo, y el servidor ya puede escribir en el `input` de ComfyUI, que era la parte difícil.
- Progreso paso a paso por websocket: hoy el estado es real pero grueso (en cola con posición, generando, listo). El navegador no puede conectarse al websocket de ComfyUI por lo mismo del `Origin`, así que habría que hacer de puente desde el servidor.
- **Responsive sin verificar en navegador.** No hay anchos fijos y la bandeja topa en `86vw`, pero nadie lo ha abierto en una ventana angosta.
- El usuario marcó dos direcciones de futuro, ya en el backlog: app de escritorio (B-005) y fase previa de instalación con portal de ingreso (B-006).
- Al construir la interfaz, corregir lo que el modelo de imagen hizo mal en los bocetos: superficies mates y no vidriosas, grilla del campo al 8%, bandeja subordinada al escenario, y fila activa marcada con filo lateral y no con recuadro naranja completo.
- `DESIGN.md` se escribe al terminar la Fase 1, desde el mundo construido, como manda el flujo de `impeccable`.
- ✅ Resuelto en la sesión: `.gitattributes` añadido, se acabaron los avisos de LF/CRLF.
- Los bocetos quedaron en `.tmp/sketches/`, que está gitignorado y es territorio de purga.
