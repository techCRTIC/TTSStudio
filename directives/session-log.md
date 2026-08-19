# Bitácora de sesiones — TTS Studio

> Registro cronológico de cada sesión de trabajo. La entrada más nueva va
> ARRIBA. Cada entrada abre con su bloque de cierre — el resumen que la próxima
> sesión lee primero — y sigue con el detalle: fecha/hora, qué pidió el usuario,
> acciones, decisiones (con alternativas descartadas), resultados y próximos
> pasos.

## 2026-08-19 — De carpeta vacía a una app que genera voz

<!-- cierre -->
## 🧾 Cierre — Sesión 1 · 2026-08-19

**En una frase:** TTS Studio nació entero en una sesión — identidad, arquitectura, dirección visual, y una app que genera voz clonada de verdad, auditada y corregida.

**Qué se hizo**
- Se levantó el andamiaje del proyecto, que no existía, y se inició el repositorio.
- Se definió qué es TTS Studio: una app con interfaz para generar voz clonada, de un solo usuario, con el motor Qwen3-TTS corriendo local sobre ComfyUI.
- Se midió un límite de ComfyUI que decidió la arquitectura: rechaza con 403 cualquier petición que venga de otro origen. Eso obliga a que la app tenga un componente de servidor propio.
- Se eligió el stack (Next.js con Tailwind y shadcn) y se cerró la dirección visual: un spinoff oscuro del sistema CRTIC clean, con una pantalla de escenario central y una bandeja lateral para el guión y el historial.
- Se generaron tres bocetos con Qwen-Image en el ComfyUI de la casa para ver la dirección antes de construirla.
- Se construyó la Fase 0: proyecto Next en pie, capa de tokens oscuros, y el proxy hacia ComfyUI con siete tests en verde, dos de ellos contra el motor real.
- El usuario dejó el kit real del sistema CRTIC dentro del proyecto a mitad de sesión. Se verificó que su versión vigente es idéntica a la que ya se había usado para derivar los tokens, así que no hubo nada que rehacer.
- Se construyó la pantalla de generación: la tarjeta central sobre un campo de audio animado, la bandeja lateral con el historial, la onda dibujada desde el audio real, y el selector de voz que lee la biblioteca directamente del motor.
- **El usuario la abrió, generó sin problemas y aprobó el diseño.** La cadena completa está probada por él, no por mí.
- Se le pasó una auditoría técnica: siete hallazgos verificados, todos corregidos. El puntaje de salud subió de 13/20 a 18/20.
- Se escribió el README con cómo correrla, para que las instrucciones no vivan solo en la conversación.
- Se englobó todo en **un solo `npm start`** desde la raíz: comprueba y levanta ComfyUI, libera el puerto, compila, arranca y abre el navegador cuando la app ya responde.
- El usuario señaló tres molestias visuales y se corrigieron: el rectángulo naranja de foco sobre el cuadro de texto, el desplegable nativo de la voz, y un fondo animado que a veces se pegaba.
- El cuadro de texto pasó a crecer con lo que se escribe, con desvanecidos en los bordes cuando hay más contenido del que cabe.

**Qué se decidió y por qué**
- **App con interfaz**, no un pipeline de scripts ni un laboratorio de fine-tuning: el objetivo es usarla a diario, no automatizarla.
- **Motor local Qwen3-TTS**, porque ya estaba instalado y validado con audio real, no cuesta por uso y la voz nunca sale de la máquina. Se descartaron las APIs de pago y el híbrido.
- **Next.js sobre Tauri**, aunque Tauri daría una app de escritorio de verdad: el toolchain de Rust y las compilaciones lentas gravan cada iteración, y un MVP gasta iteraciones. Tauri sigue disponible como envoltorio más adelante.
- **El servidor MCP `comfy` queda fuera del runtime de la app.** Es un protocolo para agentes; meterlo dentro de la app arrastraría comfy-cli, un venv de Python y prompts de consentimiento en medio de la interfaz.
- **El botón primario invierte su tinta respecto del sistema padre.** Se midió que blanco sobre el naranja da 3,54 y no pasa el estándar de contraste; grafito sobre naranja da 5,15.
- **Se descartó `AetherFlow` como fondo animado** en favor de `PlotFieldBg`: el primero es morado sobre negro puro, que viola dos prohibiciones del sistema, y no respeta movimiento reducido.

- **El fondo animado no es decoración prestada:** cada capa del campo es una suma de dos senoides, que es lo que es una onda de audio. El fondo es el tema del producto, no un adorno encima.
- **El historial vive en el navegador**, no en una base de datos: es una app de un solo usuario donde nada se comparte ni se consulta, así que una base de datos sería ceremonia.
- **El lanzador solo mata lo que confirma que es suyo.** Antes de liberar el puerto consulta quién contesta y exige el título de la app; cualquier otra cosa la reporta y se detiene, en vez de matar un proceso ajeno del usuario.
- **Los audios no se copian al proyecto.** Quedan en la salida de ComfyUI y la app los referencia por URL; duplicarlos gastaría el doble de disco sin ganar nada. A cambio, el historial guarda texto y enlace, no audio: si se vacía esa carpeta, las tomas viejas dejan de sonar.

**Un error propio, corregido en la sesión:** el primer `git add -A` metió los 74 archivos del kit de diseño dentro del commit de la Fase 0, bajo un mensaje que hablaba de otra cosa. Se separaron en dos commits antes de seguir; estaba sin push, así que fue limpio.

**Estado al cerrar:** rama `main` · árbol limpio · veinte commits · 7 tests en verde · build correcto · detector de diseño sin hallazgos. La app genera voz y el usuario lo confirmó. Lo único no verificado es **el comportamiento en ventanas angostas**: no hubo navegador en la sesión, así que el responsive se juzgó leyendo el código, no viéndolo.
**Siguiente paso concreto:** la Fase 2, dar de alta voces nuevas desde un audio de referencia — hoy solo existe *Andres Bobe* porque ya estaba en disco. Para levantar todo: `npm start` desde la raíz.
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

### Next steps / open questions
- **Fase 2, la biblioteca de voces:** dar de alta una voz nueva desde audio de referencia. Es lo que convierte esto en herramienta y no en demo, y el servidor ya puede escribir en el `input` de ComfyUI, que era la parte difícil.
- Progreso paso a paso por websocket: hoy el estado es real pero grueso (en cola con posición, generando, listo). El navegador no puede conectarse al websocket de ComfyUI por lo mismo del `Origin`, así que habría que hacer de puente desde el servidor.
- **Responsive sin verificar en navegador.** No hay anchos fijos y la bandeja topa en `86vw`, pero nadie lo ha abierto en una ventana angosta.
- El usuario marcó dos direcciones de futuro, ya en el backlog: app de escritorio (B-005) y fase previa de instalación con portal de ingreso (B-006).
- Al construir la interfaz, corregir lo que el modelo de imagen hizo mal en los bocetos: superficies mates y no vidriosas, grilla del campo al 8%, bandeja subordinada al escenario, y fila activa marcada con filo lateral y no con recuadro naranja completo.
- `DESIGN.md` se escribe al terminar la Fase 1, desde el mundo construido, como manda el flujo de `impeccable`.
- ✅ Resuelto en la sesión: `.gitattributes` añadido, se acabaron los avisos de LF/CRLF.
- Los bocetos quedaron en `.tmp/sketches/`, que está gitignorado y es territorio de purga.
