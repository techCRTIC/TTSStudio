# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué pidió el usuario,
> acciones, decisiones (con alternativas descartadas), resultados y próximos
> pasos.

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
