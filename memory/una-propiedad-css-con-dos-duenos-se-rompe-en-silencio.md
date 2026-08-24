---
name: una-propiedad-css-con-dos-duenos-se-rompe-en-silencio
description: >
  Si dos sitios distintos escriben la misma propiedad CSS, uno gana y el otro
  desaparece sin error. Pasó tres veces en un día: CSS propio contra utilidad de
  Tailwind, style en línea contra hoja de estilos, y una regla de :hover que
  reemplaza el transform entero.
metadata:
  type: gotcha
---

# Una propiedad CSS con dos dueños se rompe en silencio

**Qué pasa.** Cuando la misma propiedad se declara desde dos sitios, no hay
error ni aviso: uno gana y el trabajo del otro simplemente no ocurre. El
síntoma nunca apunta a la causa — un elemento aparece en otro lugar, o un
efecto no se ve, y uno va a buscar el bug al sitio equivocado.

**Las tres caras que mordieron el 2026-08-24, todas el mismo día:**

1. **CSS propio contra utilidad de Tailwind.** Se le puso `position: relative` a
   una clase propia para poder colgarle un pseudo-elemento. Tailwind pone sus
   utilidades en una **capa**, y el CSS plano le gana a cualquier capa. La clase
   `fixed` dejó de aplicar y las dos pestañas laterales **cayeron al flujo
   normal del documento, al final de la página**.
2. **`style` en línea contra hoja de estilos.** Un botón escribía
   `transform: scale(...)` en línea para su estado abierto. El `style` en línea
   gana siempre, así que sus reglas de `:hover` y `:active` del CSS **nunca se
   aplicaron**: el control quedaba inerte sin que nada fallara.
3. **Una regla que reescribe `transform` lo reemplaza ENTERO.** Un `:hover` con
   `transform: scale(1.06)` borra el `translateY(-50%)` que centraba el
   elemento, y el botón salta media altura al pasar el ratón.

**Why:** porque no hay ninguna señal. El compilador no se queja, el navegador no
avisa, el linter no lo ve — la propiedad simplemente tiene otro valor del que
uno cree haber escrito. Y como el efecto visible (algo se mueve, algo no
reacciona) no se parece a la causa, se pierde mucho rato buscando en el archivo
equivocado.

**How to apply:**

- **Una propiedad, un dueño.** Si un efecto la escribe, no puede estar además en
  el `style` de React. Si el CSS propio la escribe, no puede estar además en una
  clase de utilidad. Ver también
  [[react-inline-style-fights-imperative-dom]].
- **Antes de añadir `position`, `transform`, `display` o `width` a una clase
  propia, mira qué utilidades lleva ya el elemento.** Las de maquetación son las
  peligrosas: mueven cosas en vez de decolorarlas.
- **Toda regla que escriba `transform` debe reescribir sus partes completas.** Si
  el estado en reposo lleva `translateY(-50%)`, cada `:hover`, `:active` y
  variante de estado tiene que repetirlo.
- **Para estados que el CSS debe poder pisar, usa un atributo de datos**
  (`data-open`) en vez de un `style` en línea.
