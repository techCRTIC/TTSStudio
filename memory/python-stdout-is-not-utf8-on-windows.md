---
name: python-stdout-is-not-utf8-on-windows
description: En Windows, la salida de Python usa la página de códigos de la consola (cp1252), no UTF-8. Al leerla desde Node, cada tilde se convierte en un carácter roto. Hay que forzar UTF-8 en el script.
metadata:
  type: gotcha
---

# La salida de Python no es UTF-8 en Windows

`sys.stdout.encoding` en esta máquina es **cp1252**, no UTF-8. Así que
`json.dump(..., ensure_ascii=False)` escribe `"más"` como el byte `0xE1`, que es
cp1252 perfectamente válido y **no es UTF-8 válido**.

Node lee ese flujo y lo decodifica como UTF-8, porque decodifica todo como
UTF-8. Cada byte inválido se convierte en `U+FFFD`, y cuando el texto llega al
navegador todas las tildes son un rombo con un interrogante.

**Why:** aquí no era cosmético. La transcripción del audio de referencia es
justo el texto contra el que se calcula la huella de la voz, así que una
transcripción corrupta produce **una voz peor** — en silencio, sin que falle
nada en ninguna parte. Lo detectó el usuario mirando la pantalla, no ningún
test: todos seguían en verde.

**How to apply:**
- Todo script de `execution/` que imprima algo llama a `use_utf8()` de
  `execution/_console.py` como primera línea de su `main()`. Ya está hecho en
  los cuatro que existen; el siguiente que se escriba tiene que hacerlo también.
- Del lado que lo invoca, además: `env: { ...process.env, PYTHONIOENCODING: "utf-8" }`
  en el `spawn`, y `child.stdout.setEncoding("utf8")`. Lo segundo importa por su
  cuenta — concatenar Buffers con `+=` decodifica cada trozo por separado, así
  que un carácter de varios bytes partido justo en el borde de un trozo se rompe
  igual aunque la codificación sea correcta.
- **La consola miente en las dos direcciones.** Ver `m�s` en la terminal no
  prueba que el dato esté mal, y verlo bien no prueba que esté bien. Para
  saberlo hay que mirar los bytes: `open(ruta,'rb').read()` y comprobar si
  `.decode('utf-8')` funciona.

Relacionado: [[node-refuses-cmd-without-shell]] — la otra frontera Node↔Windows
que ya costó tiempo en este proyecto.
