---
name: medir-un-alto-no-incluye-los-margenes
description: >
  El alto de una caja excluye sus propios márgenes, así que animar un contenedor
  hasta el alto medido de su contenido lo deja corto justo por el margen — y si
  el contenedor oculta el desbordamiento, el recorte se come el final. Cortó un
  botón por la mitad.
metadata:
  type: gotcha
---

# Medir un alto no incluye los márgenes

**Qué pasa.** `offsetHeight` y `getBoundingClientRect().height` devuelven la
caja del elemento **sin sus márgenes**. Si se mide un elemento con
`margin-top: 20px` y se le da ese alto a su contenedor, el contenedor queda 20 px
más corto que lo que contiene. Con `overflow: hidden`, esos 20 px se pierden
**por abajo**: en este proyecto cortó un botón exactamente por la mitad, sin
ningún error en consola.

**Why:** porque el margen se ve como parte del elemento y no lo es — vive fuera
de su caja. Y el síntoma engaña: falta espacio al final, así que uno sospecha
del contenido, del `max-height` o del scroll, no de un margen que está arriba.

**How to apply:**

- **El elemento que se mide no lleva márgenes.** El espaciado va como *padding*
  del propio elemento medido, que sí entra en la cuenta.
- Prefiere **`getBoundingClientRect().height` con `Math.ceil`** a
  `offsetHeight`: el segundo redondea hacia abajo y puede comerse la última
  fila de un descendente o un anillo de foco.
- **Contrapartida de esa elección:** el rect **sí** refleja las transformaciones.
  El elemento medido no puede llevar una — pon la animación de entrada en un
  descendiente, cuyo `transform` no toca la caja del padre.
- Un `ResizeObserver` sobre el elemento medido mantiene el alto al día cuando el
  contenido cambia solo, sin que nadie tenga que acordarse de volver a medir.

Ver `web/src/components/PanelSlot.tsx`, que es donde vive esto.
