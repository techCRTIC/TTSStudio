# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué pidió el usuario,
> acciones, decisiones (con alternativas descartadas), resultados y próximos
> pasos.

## 2026-08-28 — Una habilidad que se lleva el stack de ComfyUI a otro computador

<!-- cierre -->
## 🧾 Cierre — Sesión 6 · 2026-08-28

**En una frase:** todo lo que este computador sabe sobre ComfyUI —cómo se
instala, qué es capaz de hacer y los siete grafos que ya funcionan— quedó
empaquetado en una habilidad que se copia a otro proyecto o a otra máquina.

**Qué se hizo**
- **Se creó `comfy-local`**, una habilidad hermana de `voz-local`. La vieja
  sigue sabiendo *locutar bien*; la nueva sabe *si la máquina puede* y cómo
  dejarla lista. `voz-local` no se tocó.
- **Se escribió una auditoría del computador** que responde por capacidad, no
  por archivo: en vez de una lista de cosas que faltan, dice «no puedes editar
  personajes porque falta un archivo de 810 MB en tal carpeta». Mira cuatro
  cosas: la tarjeta gráfica y el disco, las herramientas instaladas, ComfyUI, y
  qué flujos salen de todo eso.
- **Se rescataron siete grafos que vivían sueltos** en una carpeta del disco
  (`C:\Users\tech\comfy-workflows`), fuera de todo repositorio: cuatro de
  imagen y tres de voz. Ahora viajan versionados, con una ficha de qué necesita
  cada uno y qué hay que tocar para usarlo.
- **Se portó el conocimiento del CLI y del servidor MCP**, que hasta hoy solo
  existía repartido entre otro repositorio y la memoria de otras sesiones: los
  gotchas que cuestan horas, cómo se pide una descarga, y por qué el motor a
  veces no arranca aunque todo parezca bien puesto.
- **Se escribió un instalador que por defecto no instala nada:** imprime el plan
  exacto y se calla. Solo con una orden explícita toca el tramo barato y
  reversible. Los GB y el código de terceros se quedan siempre fuera.

**Qué se decidió y por qué**
- **Dos habilidades separadas en vez de una grande.** Saber instalar y saber
  usar bien son trabajos distintos; juntarlos daba un documento que hace dos
  cosas a medias. Se descartó absorber `voz-local`.
- **Se invirtió una decisión anterior a propósito.** Los grafos vivían fuera de
  todo repositorio para ser «universales». Lo eran *dentro de este computador*,
  y no viajaban a ninguno otro. El precio de meterlos en la habilidad es que
  ahora existen en dos sitios; la copia de la habilidad manda.
- **La habilidad no inventa enlaces de descarga.** Un enlace recordado de
  memoria que no existe cuesta más que no darlo: entrega el nombre exacto, la
  carpeta y el tamaño, y deja que el catálogo real resuelva de dónde sale.
- **Nada de rutas de este computador escritas a mano en el código.** Se
  descubren. Si estuvieran escritas, la habilidad no portearía nada.

**Estado al cerrar:** rama `main`, árbol sucio (la habilidad nueva y `voz-local`
siguen sin commitear). La auditoría y el instalador se probaron ejecutándolos
—aquí y contra un computador virgen simulado— y esa prueba destapó cuatro
defectos, los cuatro corregidos. **Queda un hueco:** la parte que comprueba los
nodos contra el ComfyUI encendido nunca se ejecutó, porque el motor estaba
apagado; por eso la auditoría reporta hoy «7 probables» y no «7 listas».

**Siguiente paso concreto:** encender ComfyUI y volver a correr la auditoría,
para ver si los siete pasan de «probable» a «lista» — es lo único que falta para
que la habilidad esté verificada de punta a punta.
<!-- /cierre -->

**Hora:** 15:20–15:55 (aprox.)

**Lo que pidió el usuario:** tomar la habilidad `voz-local` y transformarla en
una que instale el MCP de ComfyUI con todos los flujos de este computador y sus
pruebas, para portear ese conocimiento a cualquier proyecto o máquina. Aclaró
después que «pruebas» significaba **auditar el computador anfitrión** —ver si
corre lo que el usuario quiera hacer— más portar lo investigado sobre el CLI y
el MCP.

### Acciones

- **Sondeo del terreno.** Se levantó qué hay realmente instalado: ComfyUI 0.33.0
  en `C:\Users\tech\comfy`, comfy-cli 1.16.0 y comfy-mcp 0.10.0 en un entorno
  propio, el servidor MCP registrado a nivel de usuario, un solo pack de nodos
  (el de voz), dos voces guardadas, y los siete grafos sueltos con su README.
- **Se leyeron las fuentes del conocimiento a portar:** el escaneo del
  repositorio `comfy-mcp`, tres memorias del repositorio «Investigación» y el
  README de la carpeta de grafos.
- **Se escribieron 13 archivos** en `.claude/skills/comfy-local/`.
- **Se ejecutó todo lo escrito**, dos veces: contra este computador y contra uno
  simulado sin nada instalado.

### Decisiones

Las cuatro del bloque de cierre. Además: el `SKILL.md` va **en español**, como
`voz-local`, aunque la norma del proyecto pide inglés para el harness — mandó la
consistencia con la habilidad hermana, y se avisó antes de escribirlo.

### Resultados

- La auditoría encuentra **los 6 modelos de imagen en disco**: el inventario que
  se escribió calza con la máquina real, no es una lista decorativa.
- La simulación del computador virgen destapó cuatro defectos, ya corregidos:
  la lista de modelos desaparecía justo donde más falta hace; una nota salía
  duplicada; las rutas mezclaban las dos barras; y un comando impreso llevaba un
  `>` sin comillas que, pegado en una consola, no instala nada y crea un archivo
  basura.
- Ningún grafo se corrió. Los cuatro de imagen vienen validados por su README
  anterior, y así queda dicho en la habilidad en vez de presentarlos como
  probados aquí.

### Próximos pasos / preguntas abiertas

- **Encender ComfyUI y reauditar** (el hueco de verificación descrito arriba).
- **Commitear** la habilidad nueva y `voz-local`, que sigue sin trackear.
- No se tocó nada de la app: esta sesión vivió entera dentro de `.claude/`.

## 2026-08-24 (noche) — La semilla de los tramos, y el guión con el que se va a escuchar

<!-- cierre -->
## 🧾 Cierre — Sesión 5 · 2026-08-24

**En una frase:** se escuchó por primera vez un guión largo entero, y eso destapó
—y dejó arreglados— los dos defectos que lo hacían sonar mal: la app lo partía
en veintiocho trozos en vez de tres, y el volumen bailaba entre uno y otro.

**Qué se hizo**
- **Se confirmó que la voz no cambia entre trozos.** Todos se generan con la
  misma semilla: se sortea **un solo número** al confirmar el corte y ese viaja
  a todos. El usuario lo escuchó y lo confirmó: *"muy consistente el tono"*.
  Esa era una duda anotada desde hacía dos sesiones.
- **Se arregló el corte del guión, que era el defecto de fondo.** La app cerraba
  un trozo al final de **cada párrafo**, aunque cupieran diez juntos, así que el
  límite de tamaño no actuaba entre párrafos. Un guión que cabía en dos pasadas
  salía en **veintiocho**. Y el disparador habitual era el propio botón de
  reescritura de la app, que reformatea el texto en párrafos cortos: una función
  de la app activaba el defecto de otra.
- **Se igualó el volumen entre trozos.** El motor no tiene un objetivo de
  volumen, así que cada trozo salía como salía. Ahora se mide cada uno y se
  llevan todos al volumen del que está en medio, con un tope para que un trozo
  roto no se amplifique hasta el ruido. Se puede desactivar para comparar.
- **La app aprendió a detenerse.** Antes no había forma: el único botón vaciaba
  la pantalla mientras el motor seguía trabajando. Ahora el botón de generar se
  convierte en uno de detener, para en cuanto termine el trozo en curso, y
  **une lo que ya estaba hecho** en una pieza.
- **Se destapó que el modelo que reescribe corría con una ventana diminuta.**
  Nadie le había dicho cuánto texto puede sostener, así que ollama aplicaba su
  valor por defecto —unos pocos miles de tokens— mientras el modelo aguanta
  262.144. Y lo grave es cómo fallaba: al pasarse, **ollama descarta el
  principio del texto sin avisar**, y el modelo reescribe lo que quedó. La
  respuesta parece normal. Ahora la ventana se pide explícitamente, un guión
  demasiado largo se rechaza **antes** de gastar medio minuto, y una
  reescritura que vuelva mucho más corta que el original ya no se ofrece.
- **Y al revisar ese arreglo apareció el mismo error dentro de él.** El valor
  que fija la ventana se leía sin comprobar: si alguien escribía algo que no
  fuera un número, el resultado no era un error sino «no es un número» — y eso,
  al compararlo con nada, siempre da que no, **así que el tope recién puesto
  dejaba de existir sin cambiar de aspecto**. Corregido y cubierto con pruebas.
- **Se enderezó la caja de texto.** El título y el estado de arriba ocupaban
  todo el ancho, mientras la caja de abajo cedía sitio al raíl de herramientas
  de su costado: la cabecera sobresalía unos 50 píxeles por la derecha y la
  caja se leía torcida. Ahora cabecera y caja comparten una misma rejilla, así
  que miden lo mismo por construcción y no por un número escrito a mano.
- **Se corrigieron tres cosas más de la pantalla:** los dos cajones laterales tenían
  anchos distintos y por eso la tarjeta se veía torcida con los dos abiertos;
  las herramientas de al lado del texto quedaban desbloqueadas durante un guión
  largo, que es justo cuando tocarlas lo estropea; y el botón principal bajó de
  contraste, con relleno oscuro y borde naranja en vez de naranja macizo.

**Qué se decidió y por qué**
- **El tope de texto para reescribir se DERIVA de la ventana, no se escribe a
  mano.** El guión se paga dos veces —entra y vuelve reescrito—, así que el
  presupuesto se divide entre dos. Escribir el número suelto habría creado un
  gemelo que se queda atrás en cuanto alguien cambie la ventana. Salen 20.526
  caracteres, unos 23 minutos de locución.
- **Se rechaza en vez de truncar.** Media reescritura presentada como entera es
  peor que ninguna: parece correcta y lo que falta no se ve por ningún lado.
- **No se añadió un aviso previo en pantalla.** Con un tope de 23 minutos de
  locución, el caso es rarísimo, y el rechazo es instantáneo y dice qué hacer.
  Un aviso permanente para eso sería ruido.
- **Un trozo puede contener varios párrafos, y la pausa entre ellos la pone el
  modelo al leer** en vez del programa que los une. Decisión del usuario: una
  pausa hablada respira mejor que un silencio pegado.
- **Detener conserva y une lo hecho**, en vez de tirarlo. Y para que el historial
  no mienta, esa pieza se guarda **con el texto de los trozos que sí dice**, no
  con el guión completo — si no, parecería entera.
- **Se para entre trozos, no a mitad de uno.** Cortar la llamada en curso no
  detendría al motor: el trabajo ya está en su cola y seguiría ocupando la
  tarjeta gráfica. Se pagaría con la app diciendo "detenido" mientras no lo
  está. El precio de la versión honesta es esperar un trozo.
- **El relleno del botón es un tono más OSCURO que la tarjeta, no más claro.**
  Se midió: el tono más claro dejaba el texto naranja en 4,46 de contraste y no
  pasaba el mínimo de accesibilidad; el oscuro lo deja en 5,46. Y el color que
  pidió el usuario resultó ser exactamente el de la tarjeta, así que el relleno
  habría sido invisible.
- **El tope de corrección de volumen subió de ±6 a ±12 decibelios** porque el
  primer test lo encontró corto: un trozo a la quinta parte del volumen se
  quedaba a medio corregir, que es justo el caso que había que resolver.

**Estado al cerrar:** rama `main` · **catorce commits** ·
**árbol limpio por primera vez en tres sesiones** · **sin subir**, por decisión
mantenida · **verificado después de commitear: 197 pruebas de la app, 32 de
Python, los cuatro verificadores de costura, tipos, lint, compilación y el
detector de diseño** — este último con un único aviso, preexistente y ya
registrado como decisión (B-007) · **el guión de prueba pasó de 5 trozos a 3.**

**B-008 volvió a morder, por sexta vez.** El guardián de secretos bloqueó un
comando legítimo porque el nombre con que JavaScript lee sus variables de
entorno contiene, como subcadena, el nombre del archivo de secretos. Se rodeó
como está documentado: crear el archivo con otra herramienta y ejecutarlo
después.

**Confirmado en pantalla por el usuario:** el guión que salía en 28 trozos
**ahora sale en 3**.

**Después de commitear, la sesión siguió y pasaron tres cosas más:**
- **El motor se cayó solo** y la app pareció rota. No lo estaba: devolvía un
  aviso honesto. Quedó anotado cómo distinguirlo de un motor atascado — un
  error en 11 milésimas de segundo es que no hay nadie al otro lado.
- **Ahora la app vigila el motor mientras corre**, y lo vuelve a levantar si se
  cae, hasta tres veces. Se para ahí a propósito: si algo lo está matando por
  falta de memoria, revivirlo sin fin empeora el problema. Y el arranque en
  modo desarrollo, que antes no comprobaba nada, ahora pasa por el mismo sitio.
- **Se repasó la lista de pendientes contra el código**, y dos entradas estaban
  mal: una pedía algo que ya estaba hecho desde hacía sesiones, y otra ya tenía
  respuesta. Se cerró la respondida y se reescribió la otra.

**Siguiente paso concreto:** **escuchar la pieza unida de esos 3 trozos** y
juzgar el volumen. Es lo único de todo lo arreglado hoy que ningún test puede
comprobar, y lo único que cierra la fase de guiones largos.
<!-- /cierre -->

**Hora:** noche

**Lo que pidió el usuario:** `/start`. Al elegir el siguiente paso: cerrar la
Fase 3 escuchando, con un texto lo bastante largo como para que se trocee de
verdad —el que había usado no llegaba al umbral—. Y una pregunta: ¿está fijada
la semilla al generar tramos? Después, borrar una frase de la pantalla de
reescritura.

### Acciones

- `/start` completo. Scaffold íntegro, sin action book, salud documental al día.
  Las siete skills requeridas presentes; falta una recomendada
  (`review-animations`) y hay deriva de skills nuevas sin mapear.
- Se rastreó la semilla por las tres capas: la pantalla, el secuenciador y la
  ruta de servidor. El sorteo ocurre una sola vez, en el clic de «Generar los
  tramos», y el tipo de la función impide que llegue vacío por ese camino.
- Se redactó el guión de prueba y se corrió contra `tts_trocear_guion.py` **tres
  veces**, alargándolo hasta que un párrafo superó el umbral y el troceo produjo
  la costura de frase que faltaba.
- Se comprobó el piso de la revisión automática (20 caracteres) contra el tramo
  más corto del guión (149) y se avisó al usuario de que ese tramo es
  precisamente el territorio que nadie ha medido.
- Se borró la frase de `ImprovePanel.tsx` y se comprobó que ningún test ni
  documento la citaba.
- Verificación tras el cambio: tipos limpios, 179 pruebas en verde.

### Resultados

- Guión de prueba listo y medido: 5 tramos, 639 / 1.527 / 149 / 585 / 450
  caracteres, con una costura de frase y tres de párrafo.
- Confirmado por lectura de código: los tramos comparten semilla.
- Dos hallazgos nuevos sin registrar aún en la lista de pendientes (se ofreció
  al usuario y quedó sin respuesta): la semilla que muestra el historial y el
  test que falta.
- Una frase menos en pantalla, su motivo conservado en el código.

### Próximos pasos / preguntas abiertas

- **Escuchar la pieza unida.** Nada más cierra la fase.
- Sigue sin confirmarse: la unión, rehacer un tramo suelto y el borrado de una
  toma compuesta.
- Si el tramo de 149 caracteres falla tres veces seguidas, es casi seguro un
  falso positivo de la revisión por duración (B-015) y hay que alargarlo.
- Los 33 archivos siguen sin commitear, esperando a que la escucha salga bien.

## 2026-08-24 (tarde) — Guiones largos, de punta a punta, y la primera prueba real

<!-- cierre -->
## 🧾 Cierre — Sesión 4 · 2026-08-24

**En una frase:** la app aprendió a decir guiones largos —los parte, los genera
tramo a tramo, revisa cada uno y los une— y por primera vez se probó contra el
motor de verdad, que es donde salieron los fallos que ningún test veía.

**Qué se hizo**
- **Se trajo la mitad útil del programa de la skill de voz** que ya resolvía
  esto: partir por frases completas y unir con silencios. **No se trajo su
  forma de hablarle al motor**, porque la app ya tiene la suya y dos caminos al
  mismo motor se separan en silencio.
- **Quedó todo el camino construido**: partir, generar tramo a tramo, detectar
  cuando el motor se queda en bucle y rehacer ese trozo solo, unir, y guardarlo
  como una sola toma. En pantalla: una tira que se llena, con confirmación del
  corte antes de empezar.
- **Se añadieron las nueve voces que trae el propio modelo**, marcadas aparte de
  las clonadas.
- **Se probó de verdad y salieron tres fallos**, los tres corregidos: el
  contador de tramos contaba mal, el troceo partía textos que cabían enteros, y
  las voces del modelo pedían un modelo que no está instalado.
- **Aparecieron dos errores de documentación que venían de antes**: los papeles
  decían que la app sigue al motor por una conexión permanente —no existe— y eso
  estaba escrito en tres archivos distintos.

**Qué se decidió y por qué**
- **El número que decide «esto es largo» pasó de 600 a 1.600 caracteres.** El
  600 venía heredado y partía en tres un texto que cabía entero en una llamada,
  creando dos costuras inútiles. Se subió porque ahora el bucle se detecta y se
  rehace solo, así que trocear pequeño ya no compra lo que compraba. Queda
  dicho en el código que es una apuesta, no una medición.
- **Las voces del modelo no se ofrecen si su modelo no está descargado.** Son
  otros ~4 GB aparte. Enseñar nueve voces que fallan al generar es prometer lo
  que no se puede cumplir; enseñarlas en gris con un botón de instalar es
  trabajo del instalador, que está pendiente.
- **La intención (enfado, calma) solo aparece con esas voces**, porque solo
  ellas la aceptan. El servidor la rechaza en el otro camino en vez de
  aceptarla y tragársela.
- **Se commiteó a mitad de sesión, no al final**, para dejar un punto de retorno
  antes de tocar la pantalla, que es lo único que ya funcionaba.

**Estado al cerrar:** rama `main` · **cuatro commits** (hasta `750eed9`), **sin
subir** · **29 archivos sin commitear por decisión**, esperando a que las
pruebas contra el motor terminen de salir bien · **179 pruebas de la app, 24 de
Python, los cuatro verificadores de costura, tipos, lint y compilación: todo en
verde** · **confirmado funcionando contra el motor**: el troceo, la tira, el
contador y la generación por tramos con una voz clonada · **SIN confirmar
todavía**: la unión final, rehacer un tramo suelto, cómo suenan las costuras, y
las nueve voces del modelo (falta su descarga).

**Siguiente paso concreto:** generar un guión largo entero con `npm start` y
**escuchar la pieza unida** — si las costuras suenan, ajustar las pausas de
0,28 s y 0,65 s en `execution/tts_unir_tramos.py`. Es el criterio de salida de
la fase y lo único que ningún test puede juzgar.
<!-- /cierre -->

**Hora:** 14:30–19:00 (aprox.)

**Lo que pidió el usuario:** `/start`, y al elegir el siguiente paso, abrir la
Fase 3 del roadmap. Después: la ruta que faltaba y la pantalla; un guión de
prueba; las voces preestablecidas en la lista, diferenciadas por color; y tres
correcciones surgidas de probar contra el motor.

### Acciones

- `/start` completo. Salud documental al día, sin action book.
- Se leyó entero `tts_narrar_largo.py` de la skill `voz-local` y se cruzó contra
  el código real antes de decidir qué se trae.
- `uv add soundfile` (0.14.0), `uv add --dev pytest` (9.1.1), `uv add numpy`
  (declarado explícitamente; entraba de prestado). Arnés de pytest montado en
  `execution/tests/` con `testpaths` acotado.
- Pipeline `/team-new-feature` en modo plan y en modo build, dos veces. Al plan
  se le corrigieron dos fallos antes de construir: ninguna tarea añadía la
  constante de TypeScript que el verificador debía comparar, y el aislamiento en
  worktrees habría impedido que las tareas se leyeran entre sí.
- `security-reviewer` sobre el cambio: **CONCERNS sin bloqueantes**, cinco
  arreglos aplicados ANTES de commitear (topes de tamaño, techo de plazo,
  trazabilidad por posición en el borrado, saneado de rutas absolutas en los
  errores, `numpy` declarado).
- `git-lead` propuso cuatro commits por capas; aprobados y ejecutados.
- Suite de diseño obligatoria enganchada (`impeccable`, `emil-design-eng`,
  `ui-ux-pro-max`) antes de tocar UI; guía destilada e inyectada en los
  especialistas. Detector de diseño corrido al terminar: sin hallazgos.

### Decisiones

Las seis de la fase están en `ADR-007`. Las de esta sesión posteriores al ADR:
el umbral a 1.600, las voces del modelo ocultas sin su checkpoint, y la
intención expuesta solo en el camino que la soporta.

### Resultados

- **Fase 3 completa en código.** Dos scripts deterministas nuevos, un cuarto
  verificador de costura, cuatro rutas de servidor, el secuenciador, la tira y
  el enganche en la pantalla.
- **Nueve voces del modelo** disponibles cuando su checkpoint esté.
- **Tres correcciones de documentación**: la conexión permanente inexistente en
  el roadmap y en `PRODUCT.md`, y la creencia de que las voces del modelo
  viajaban con el software.
- **Cinco entradas nuevas en la lista de pendientes** (B-013 a B-017).
- **Una memoria nueva**: especialistas en paralelo pisándose las dependencias.

### Próximos pasos / preguntas abiertas

- Escuchar la pieza unida. Es lo único que decide si la fase está terminada.
- Descargar `Qwen3-TTS-12Hz-1.7B-CustomVoice` (~4 GB) si se quieren las nueve
  voces. Decisión del usuario: no se descarga nada por sorpresa.
- Sin medir: **B-015** (la longitud mínima bajo la que no se juzga un tramo) y
  la pregunta de memoria de **B-016** (si un modelo grande cabe cargándose y
  descargándose por turnos).

## 2026-08-24 — Procedencia de las voces, escritura asistida y el rediseño del escenario

<!-- cierre -->
## 🧾 Cierre — Sesión 3 · 2026-08-24

**En una frase:** la app dejó de tratar el texto y las voces como cosas que
llegan ya listas — ahora cada voz dice de quién es y se puede escuchar, y el
texto se revisa y se reescribe antes de convertirse en audio.

**Qué se hizo**
- **Cada voz dice de quién es.** Junto a cada voz vive un archivo con su nombre
  bien escrito, cuándo se registró, de dónde salió el audio y una nota libre
  donde va el permiso de la persona. Se puede rellenar también para las voces
  que ya existían.
- **Se puede escuchar una voz sin generar una toma.** La primera vez el motor
  dice una frase corta y queda guardada; medido, 2,1 segundos.
- **Apareció un registro de procedencia que llevaba desde la primera sesión en
  el disco** y que la app nunca había leído, con el detalle de de qué entrevista
  salió la voz de Andrés. Se trajo sin pisar nada.
- **La app aprendió a escribir para la voz.** Un botón revisa ortografía y ritmo
  y propone una versión mejor, **marcando qué palabras cambiaron de verdad**.
- **Se puede marcar una toma como buena**, que es lo único que la app no puede
  saber por su cuenta.
- **Se rediseñó el escenario.** Los controles secundarios se fueron a un raíl al
  costado del campo, el campo cede su altura cuando se abre un panel —así la
  tarjeta ya no se estira fuera de la pantalla— y los cajones laterales se abren
  desde dos botones circulares: el panel no se desliza, **crece desde el botón**.
- **Se quitó el autocompletado que sugería texto mientras escribías**, a
  petición del usuario.

**Qué se decidió y por qué**
- **La procedencia vive junto a la voz, no en el navegador.** En el navegador se
  perdería al cambiar de perfil mientras el archivo de la voz sobrevive, que es
  justo lo que no se puede perder. Queda como ADR-005.
- **Escuchar una voz es escuchar la imitación, no a la persona.** El audio
  original se borra al crear la voz, y además enseñaría la muestra equivocada
  para elegir.
- **Lo mecánico lo hace código, no el modelo.** Detectar una tilde ausente o
  convertir «31/12/2026» en palabras tiene una sola respuesta correcta. El
  modelo solo hace lo que es criterio. Queda como ADR-006.
- **La investigación ya estaba hecha y el usuario lo señaló.** Se iba a medir la
  puntuación desde cero; estaba medida en su skill de voz, con dos programas ya
  escritos. Se trajeron tal cual en vez de rehacerlos.
- **Se cambió a mitad de sesión cómo se le pregunta al modelo.** Se le pedía la
  respuesta rápido, y así no obedece instrucciones: continúa un patrón, que es
  el mecanismo que inventa cosas. Ahora piensa antes de responder: tarda veinte
  o treinta segundos y es mucho más fiel. Esa rapidez solo hacía falta por el
  autocompletado, que ya no existe.
- **Y como razonar no elimina el invento, el guardián se movió a la pantalla:**
  la propuesta marca las palabras que cambiaron. Pedirle a una persona que
  encuentre una letra distinta dentro de un párrafo reescrito no funciona.
- **Un modelo más grande no cabe.** Los dos que hay son de 18 GB y el motor de
  voz deja 16 libres.

**Estado al cerrar:** rama `main` · **todo commiteado al cerrar** · **109 tests
en verde, ninguno saltado** · tipos, lint y compilación limpios · los **tres**
verificadores de costura en verde · el detector de diseño solo con excepciones
ya documentadas. El usuario revisó el resultado en pantalla y lo aprobó
(«quedó increíble», «está impecable»). **Nada a medias.**

**Siguiente paso concreto:** empezar la **Fase 3 del roadmap — guiones largos**:
partir un texto de varios minutos en tramos, generarlos y unirlos. El plan de
cómo trocear ya existe medido en la skill `voz-local`
(`scripts/tts_narrar_largo.py`), así que el primer paso es leer ese script y
decidir qué parte se trae a `execution/`.
<!-- /cierre -->

**Hora:** 15:00 (aprox.)

**Lo que pidió el usuario:** cerrar la Fase 2 del roadmap — las dos cosas que
faltaban para darla por terminada: que se vea **de quién es** cada voz
(procedencia) y poder **escuchar una voz sin tener que generar una toma**.

### Acciones

- `/start`: el andamiaje estaba completo, no se creó nada. Se detectó que
  `project-overview.md` describe el estado de la sesión 1 y afirma cosas que
  dejaron de ser ciertas («la Fase 2 no ha empezado», «hoy solo existe una
  voz»). Queda por corregir.
- Se leyó el código real antes de proponer nada, y apareció el hallazgo que da
  forma a toda la sesión: **hoy no existe ninguna metadata de voces**.
  `listVoices()` no lee un registro; lee el desplegable que ComfyUI expone en
  `object_info` y parte el nombre del archivo. Así que la procedencia no es
  mostrar un dato que ya se tiene: es empezar a guardar datos que no se guardan.
- Se verificó en el código del pack (`nodes.py:636-638`) que la lista de voces
  filtra por `.safetensors`, así que un archivo de datos al lado **no** se
  convierte en una voz fantasma en el selector. Comprobado, no supuesto.

### Decisiones

- **La procedencia vive en un archivo junto a la voz, en el disco del motor**
  (`<slug>.json` al lado de `<slug>.safetensors`). Alternativas descartadas:
  `localStorage` —donde se perdería al cambiar de navegador mientras el archivo
  de la voz sobrevive, que es justo lo que la fase pide no perder— y un registro
  único del proyecto, que no viaja con la voz y hay que reconciliar a mano.
- **La reconciliación: el motor manda.** Una voz sin archivo de procedencia se
  muestra como «sin procedencia registrada», que es la verdad, y se puede
  rellenar. Un archivo de procedencia sin voz se ignora. Borrar una voz borra
  los dos.
- **Escuchar una voz significa escuchar lo que el motor produce con ella**, no
  el clip original: ese clip se borra al crear la voz (decisión de la sesión 2)
  y además enseñaría a la persona real en vez de la imitación, que es la
  muestra equivocada para elegir. Se genera una frase fija —la misma para todas,
  para poder compararlas— la primera vez que se pulsa, y se recuerda.
  Descartado generarla al dar de alta: alarga el alta justo cuando el usuario
  espera, y paga una generación por voz aunque nunca se escuche.
- **Hay que poder editar la procedencia de una voz que ya existe**, no solo
  capturarla al registrar. Sin esto, `andres_bobe.safetensors` —la única voz
  real del proyecto, anterior a todo esto— se quedaría sin procedencia para
  siempre y la funcionalidad sería invisible justo donde importa.
- **No se guarda la transcripción del clip.** No hace falta para acreditar
  procedencia y es la frase que dijo una persona (CLAUDE.md § minimización).

### Acciones (continuación, con el motor encendido)

- Se midió la muestra **por la ruta real de la app**, no por un atajo: 2,1 s la
  primera pulsación con el modelo caliente, 110 KB de audio, instantánea la
  segunda. Un segundo dato («0,0 s» en una generación idéntica) se **descartó
  por inválido**: era la caché de grafos de ComfyUI, no una medición.
- Apareció un fallo de verdad que ningún test unitario veía: la ruta de la
  muestra guardaba el nombre del archivo en crudo como nombre visible, y como la
  lista prefiere el nombre guardado, **escuchar una voz la renombraba**
  («Alexander Frings» → «alexander_frings»). El usuario lo vio en pantalla en el
  mismo momento. Se corrigió la ruta y se repararon los dos archivos ya escritos.
  Se barrió el resto de sitios donde la app escribe un valor visible sin que lo
  teclee el usuario: no había más casos.
- Al inspeccionar el directorio del motor apareció **`voces.json`**, del
  2026-08-19, con la procedencia de Andrés (la entrevista, el pasaje
  5.02–15.66 s, la duración) que la app nunca había leído. Se escribió
  `execution/migrate_voice_provenance.py` para traerla.
- Se corrigió el ADR-005, que afirmaba que no existía dónde guardar la
  procedencia.

### Resultados

- **85 tests en verde, ninguno saltado** (los dos que hablan con ComfyUI
  volvieron a correr al estar el motor encendido), tipos, lint y compilación
  limpios, los tres verificadores de costura en verde.
- El verificador nuevo se probó **contra cuatro formas de rotura** y las caza
  todas; también se le corrigió una afirmación no ganada cuando el pack no está
  instalado.
- La app, corriendo, devuelve ya los nombres correctos y la procedencia real de
  Andrés.
- Nada commiteado.

### Acciones (tercera parte: escritura asistida)

**Lo que pidió el usuario:** dos cosas — un modelo que sugiera la continuación
del texto en modo fantasma, aceptable con Tab; y un botón que mejore lo escrito
con las reglas de puntuación y lo aprendido de los mejores resultados.

- Se investigó antes de proponer, y el planteamiento inicial resultó equivocado:
  se iba a medir la puntuación desde cero porque en ESTE repo no había nada. El
  usuario corrigió el rumbo — la investigación estaba hecha, en su skill
  `voz-local`. Ahí estaban **las mediciones** (la ortografía cambia la locución
  entre +15 % y +29 %; la puntuación mueve el ritmo 3,5× más que el parámetro
  `instruct` de un fine-tune) **y dos scripts ya escritos** que las aplican.
- Eso redujo el papel del modelo enormemente: lo determinista lo hacen los dos
  scripts traídos a `execution/`, y el modelo solo hace lo que es juicio de
  lenguaje. Es la arquitectura de tres capas de CLAUDE.md aplicada tal cual.
- Se descargó `qwen3:4b` (2,5 GB) con permiso explícito del usuario. Los dos
  modelos que ya había son de 18 GB y **no caben** junto al motor de voz, que
  deja 16 GB libres.
- Se midió todo antes de construir, y apareció el hallazgo que da forma al
  módulo: **Qwen3 razona antes de responder, y el interruptor no funciona** vía
  ollama — vuelca el razonamiento dentro de la respuesta, en inglés. 21 s y
  11.854 caracteres de deliberación para sugerir dos palabras. El **completado
  crudo**, sin plantilla de chat, responde en 50 ms y en español limpio.
- Se construyó: el puente compartido a Python (extraído de `transcribe.ts`,
  que tenía las reglas escondidas), el cliente del modelo, dos rutas, el panel
  de mejora y el texto fantasma con Tab sobre un elemento espejo.
- Se añadió **marcar una toma como buena**, que es el único dato que la app no
  puede saber sola y el prerrequisito para aprender de lo que al usuario le gusta.
- La verificación real encontró tres fallos propios: el fantasma podía sugerir
  **código Python** con poco contexto; el filtro que lo evitaba bloqueaba
  «definitivamente» e «importante» porque buscaba `def` e `import` como
  subcadenas; y el guardián estaba en la capa equivocada. Los tres corregidos y
  cubiertos con tests.

### Acciones (cuarta parte: el escenario recupera su centro)

**Lo que reportó el usuario:** la tarjeta central se estiraba de más y perdía el
centrado, con scroll. Pidió mover esos controles a los lados del campo
reutilizando su animación de crecimiento, darles presencia con una respiración,
y revisar si la lista de voces desbordaría.

- Se cargó la suite de diseño obligatoria (`impeccable`) antes de tocar nada,
  como exige CLAUDE.md para cualquier trabajo de UI.
- **Diagnóstico con números, no a ojo:** la tarjeta apilaba etiqueta, campo
  (132-340 px), panel de mejora, panel avanzado, onda y botones. Con el campo
  lleno y un panel abierto pasaba de 1.100 px y dejaba de caber.
- **Un raíl vertical junto al campo** con los dos disparadores. Ocupa el margen
  que el texto no usaba, así que su coste vertical es cero — donde antes cada
  uno gastaba una fila estuviera abierto o no.
- **Un solo espacio de panel**, uno abierto a la vez, que se despliega con la
  misma técnica de rejilla que ya usa el escenario.
- **El campo cede su techo cuando un panel se abre** (340 → 160 px) usando su
  propia transición de crecimiento. Nada nuevo se anima: solo se mueve el techo.
  Es lo que mantiene la altura total casi constante.
- **La respiración es señal, no adorno.** Se añadió una revisión continua del
  texto —determinista, sin modelo, ~80 ms— y el punto del botón **respira solo
  cuando hay un problema bloqueante**. Un aviso menor lleva punto fijo. Un punto
  que respira con cada dígito suelto equivale a no tener punto.
- **El cajón de voces sí desbordaba**, y de la peor manera: la lista y el
  formulario de alta compartían un único contenedor con scroll, así que con
  muchas voces el alta —la puerta de entrada al cajón— quedaba enterrada debajo
  de todas ellas. Ahora la lista scrollea sola y el alta está anclada abajo, con
  su propio techo para cuando crece durante el registro.
- El detector de diseño no encontró ningún hallazgo nuevo: solo la excepción de
  `transition: height` que ya estaba documentada en el propio archivo.

### Acciones (quinta parte: el movimiento)

**Lo que reportó el usuario:** los botones del raíl no seguían la fluidez del
resto, y aclaró que «los laterales» eran **las pestañas de los cajones** —
quería glow en ellas y que los cajones se abrieran con el mismo juego de
animación que la tarjeta central.

- Se escribió una tesis de movimiento antes de tocar, como pide la referencia:
  el momento focal es la apertura del cajón; la continuidad es que pestaña y
  cajón son el mismo objeto; y los botones del raíl necesitan acuse de pulsación.
- **Las pestañas** llevan ahora el glow de acento que ya usaba la tarjeta focal
  (`--glow-accent` es token de la casa, no decoración importada), se inclinan
  hacia fuera al pasar el cursor —en la misma dirección en que va a salir el
  cajón, así el gesto adelanta el resultado— y les crece un filo de acento en el
  borde exterior.
- **Los cajones florecen**: el panel entra y su contenido se asienta detrás con
  80 ms de retraso. Es el mismo movimiento en dos tiempos que hace la tarjeta al
  desplegarse. Al cerrar no hay retraso y la duración es más corta: una salida
  que imita a su entrada se lee como duda.
- **Los botones del raíl**: pulsación con escala, estado abierto encendido por
  dentro con anillo y halo, y la marca **llega** con una animación de entrada en
  vez de aparecer de golpe.
- **Se encontró un defecto de fluidez real que nadie había señalado:** al abrir
  un panel, el campo se encogía en 150 ms mientras el panel se desplegaba en
  360 ms — se veía un hueco abrirse y luego rellenarse. Ahora el campo distingue
  las dos razones por las que cambia de alto: si creció el CONTENIDO usa su ritmo
  corto de siempre; si se movió el TECHO toma el mismo glide que el panel, porque
  son dos mitades de un solo gesto.
- Para lograrlo hubo que sacar `transition` del `style` de React y llevarlo al
  CSS: es exactamente la trampa de [[react-inline-style-fights-imperative-dom]],
  que ya estaba documentada en la memoria del proyecto.
- De paso se quitó un número mágico: la bandeja de tomas calculaba el alto de su
  lista como `100dvh - 73px`, la altura de su cabecera medida una vez y
  congelada. Ahora es una columna flex y no necesita el número.
- Detector de diseño: **sin hallazgos nuevos**. El único que sale es la
  excepción de `transition: height`, que se mudó de archivo con el código y
  lleva su justificación escrita al lado.

### Acciones (sexta parte: cuatro pasos pedidos por el usuario)

**Lo que reportó:** las pestañas laterales «quedaron horribles, escondidas
abajo»; quería en su lugar botones circulares junto al chatbox que se
transformen en su panel; la animación se anulaba al cambiar de panel y al
cerrar; y fuera el texto fantasma. Pidió explícitamente ir paso por paso.

- **La causa de las pestañas rotas, medida y no adivinada:** `position: relative`
  en CSS plano le gana a la clase `fixed` de Tailwind, que va en una capa. Las
  pestañas dejaron de estar fijas y cayeron al flujo del documento, al final de
  la página. Revertido antes que nada.
- **Paso 1 — fuera el fantasma.** Borrado entero: el espejo del campo, el
  enganche, la ruta y la función del modelo, con sus tests.
- **Paso 2 — la animación.** El contenido se desmontaba en el mismo render que
  cerraba el panel, así que no quedaba nada de donde plegarse; y
  `grid-template-rows` no puede interpolar entre dos alturas de contenido, que
  es lo que hace falta al cambiar de panel. Se hizo un `PanelSlot` que mide su
  contenido y anima una altura explícita: cubre abrir, cambiar, cerrar y un
  panel que crece solo, con una sola regla.
- **Paso 3 — los botones circulares.** Dos, flanqueando la tarjeta, y el cajón
  ya no se desliza: se **revela con un `clip-path` circular que nace justo donde
  está el botón**. Las pestañas del borde desaparecieron.
- Se cazó el mismo tipo de fallo antes de que lo viera el usuario: un
  `transform` en línea en el botón habría pisado sus reglas de `:hover` y
  `:active`. Todo el `transform` pasó al CSS.
- **Paso 4 — la calidad de la reescritura**, que el usuario reportó a mitad de
  camino («algunas son bastante alucinación»). Resultó ser consecuencia del paso
  1: el modo de completado crudo existía por la latencia del fantasma, y en ese
  modo el modelo **no obedece instrucciones, continúa un patrón** — que es el
  mecanismo que inventa. Sin fantasma, esa restricción desapareció.
- Se midió: crudo cambiaba «cambió todo» por «cambié todo»; razonando lo
  respetaba. Una primera instrucción salió fiel pero sin ritmo, así que se
  reequilibró y se volvió a medir hasta lograr las dos cosas.
- **Y se comprobó que razonar no basta:** en la verificación final volvió a
  fallar una de tres. Así que el guardián se movió del modelo a la interfaz: un
  diff que **marca las palabras que de verdad cambiaron**, plegando tildes,
  mayúsculas y puntuación fuera de la comparación para que las correcciones
  pedidas no ensucien las marcas.

### Acciones (séptima parte: el cierre)

- El usuario aprobó el rediseño y mandó una captura con **el botón «Revisar»
  cortado por la mitad**. Tres defectos en una sola imagen, los tres corregidos:
  1. **El recorte, que era el fallo real.** El panel medía el alto de su
     contenido con `offsetHeight`, y **el alto de una caja no incluye sus
     márgenes**. Ese elemento llevaba `mt-5`: la caja quedaba 20 px corta y, al
     ocultar el desbordamiento, se comía el final. El espacio pasó a ser padding
     dentro del elemento medido.
  2. **El botón salía muerto con el campo vacío** — en la captura lo que se lee
     es el texto de ejemplo. Ahora sin texto no se ofrece ninguna acción.
  3. **Competía con «Generar»**: mismo naranja sólido. Ahora va con contorno.
- Se actualizó `project-overview.md`, que seguía describiendo la sesión 1 y
  afirmaba que la Fase 2 no había empezado.
- Se escribieron dos memorias nuevas con las trampas que costaron rondas:
  una propiedad CSS con dos dueños, y medir un alto sin contar los márgenes.

### Próximos pasos / preguntas abiertas

- **Fase 3 — guiones largos.** Es lo siguiente del roadmap. El troceo por frases
  completas ya está resuelto y medido en `tts_narrar_largo.py` de la skill
  `voz-local`; hay que decidir qué parte se trae a `execution/`.
- **Ventanas angostas:** sin verificar desde la sesión 1.
- **B-008:** el hook de secretos bloquea código JavaScript legítimo. Mordió tres
  veces esta sesión. Sin tocar porque `.claude/hooks/` exige permiso fresco.
- **B-009:** ¿una semilla transfiere carácter entre textos distintos? Sin medir.
- **B-010:** el normalizador dice «un veintiuno por ciento» donde va «veintiún».
- **B-011:** unir las tomas marcadas como buenas con la reescritura.
- **B-012:** la app no instala ollama ni el modelo de texto.
- **PII en el repositorio:** el nombre de una persona real aparece en ADRs,
  bitácora y código desde sesiones anteriores. Mientras el repo sea privado no
  pasa nada; si se publicara, es exposición. Decisión del usuario.


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
- **Se midió cuánto audio produce el motor por token** y el ajuste de longitud
  pasó a estar en minutos y segundos, que es como piensa una persona.
- **El audio de referencia se borra solo** en cuanto la voz queda creada: ya no
  hace falta, y es la grabación de una persona.
- Se arregló que **las tildes salieran rotas** en la transcripción, que no era un
  problema de aspecto: ese texto es con el que se fabrica la voz.
- Se arregló que **el reproductor avanzara a tirones** de un segundo.

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
- **La duración se mide, no se deduce del nombre del modelo.** El modelo se
  llama «12Hz», lo que sugería 12 tokens por segundo. La medición dio 12,56.
  Un nombre es una pista, y aquí las pistas no se publican como hechos.

**Estado al cerrar:** rama `main` · **13 commits hechos** · **65 tests
en verde, ninguno saltado** · tipos, lint y compilación limpios · los **dos**
verificadores de costura en verde · el detector de diseño sin hallazgos. El alta
de voz se ejecutó **de principio a fin contra el motor real** y creó una voz
nueva; los tres borrados de archivos se verificaron contra el disco real con
señuelos, sin tocar nada del usuario. El usuario ya probó en el navegador la
biblioteca de voces y las opciones avanzadas, y las aprobó.

**Siguiente paso concreto:** reiniciar la app y probar lo último que no ha visto
nadie: grabar una voz leyendo el guión, el desplegable ya sin cortarse, y el
ajuste de duración ahora en minutos en vez de en tokens.
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

### Quinta parte — el desplegable cortado y los tokens en minutos
El usuario mandó otra captura: el desplegable nuevo se veía bien pero **salía
cortado**. Y planteó algo mejor sobre el techo de longitud: *«esa no es una
unidad humana, ¿qué tal si haces un benchmark aprox de cuánto tiempo es?»*.

- **El corte.** El panel del desplegable es absoluto, y estaba dentro del bloque
  que se pliega con `grid-template-rows`, que necesita `overflow: hidden` para
  poder plegarse. Cualquier ancestro con eso recorta lo que sobresale. Se pasó
  el panel a un **portal en `<body>`**, con posición fija calculada contra el
  botón y recalculada al hacer scroll. Además ahora **elige el lado según el
  espacio real** y se limita a la altura disponible en vez de salirse.
- **Los tokens, medidos.** Se escribió `execution/benchmark_token_rate.py`, que
  convierte el techo en lo que se mide: se le da al motor mucho más texto del
  que cabe, y el audio que vuelve es exactamente el techo en forma de sonido.
  **12,56 tokens por segundo**, con cuatro medidas y 0,5 % de dispersión.
- **El primer intento del benchmark estaba mal, y se descubrió mirando.** Dio
  12,60 / 12,55 / **13,50**, y el tercero no era ruido: con ese techo el texto
  ya se había acabado antes, así que esa medida no medía el techo sino el largo
  del párrafo. Una corrida de control con el techo máximo devolvió exactamente
  la misma duración y lo probó. **El script ahora hace primero esa corrida de
  control y descarta en voz alta las medidas que no limitan.** Promediarlas era
  un tope silencioso: un número equivocado con aire de medición.
- **El campo de tokens pasó a ser un desplegable de duraciones**: hasta 30
  segundos, 1 minuto, 2 minutos, 5 minutos, y todo lo que da el motor (11 min).
  Cada etiqueta se comprueba en los tests contra la tasa medida, para que la
  interfaz no empiece a mentir si algo cambia.
- El verificador de opciones ahora también comprueba que **ningún preset caiga
  fuera del rango o del paso del motor**: una opción así fallaría justo al
  elegirla.

### Sexta parte — las tildes rotas y el reproductor a tirones
El usuario probó la grabación («funciona impecable») y encontró dos cosas.

- **Las tildes salían rotas en la transcripción.** La causa: en Windows, la
  salida de Python usa la página de códigos de la consola (cp1252), no UTF-8.
  «más» se escribía como un byte que **no es UTF-8 válido**, Node lo leía como
  UTF-8, y cada tilde se convertía en un rombo.
  - **No era cosmético.** Ese texto es contra el que se calcula la huella de la
    voz, así que una transcripción corrupta da una voz peor, en silencio y con
    todos los tests en verde.
  - Se comprobó si había contaminado alguna voz existente: **no.** `andres_bobe`
    se creó a mano en la sesión 1 y está limpia; la voz de prueba ya la había
    borrado el usuario.
  - Se arregló **la clase entera**, no el caso: los cuatro scripts de
    `execution/` tenían el mismo defecto. Se creó `execution/_console.py` y
    todos lo usan. Del lado de Node se añadió además `PYTHONIOENCODING` y
    `setEncoding`, esto último porque concatenar Buffers rompe un carácter que
    caiga justo en el borde de un trozo aunque la codificación sea correcta.
- **El reproductor avanzaba a saltos de un segundo.** Escuchaba el evento
  `timeupdate`, que el navegador dispara unas cuatro veces por segundo. Ahora
  sigue la reproducción por fotograma.
  - De paso se arregló algo peor que estaba al lado: **el repintado
    redimensionaba el lienzo en cada cambio**, y redimensionar un lienzo lo
    reinicia entero. Ahora solo se redimensiona cuando el tamaño cambia de
    verdad, y el dibujo no asigna nada por fotograma.
  - El texto del tiempo sigue actualizándose una vez por segundo, que es cuando
    cambia: sesenta re-renders para volver a escribir «0:07» es desperdicio.
  - Se dejó escrito en el código que **leer el reloj del audio aquí es correcto**
    y es la excepción documentada a [[canvas-loops-need-accumulated-time-and-zero-allocation]]:
    acumular tiempo propio serviría para una animación libre, pero un cursor que
    sigue al sonido se desincronizaría de él.

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
