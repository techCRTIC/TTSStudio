---
name: qwen3-razona-salvo-en-completado-crudo
description: >
  Qwen3 razona antes de responder y el interruptor para apagarlo no funciona
  vía ollama: en vez de suprimir el razonamiento, lo vuelca dentro de la
  respuesta, en inglés. El único camino limpio es el completado crudo (`raw`),
  sin plantilla de chat.
metadata:
  type: gotcha
---

# Qwen3 razona salvo en completado crudo

**Qué pasa.** Qwen3 es un modelo de razonamiento: antes de contestar escribe
una deliberación. A través de ollama, ni `think: false` ni el token `/no_think`
la apagan — lo que hacen es **meterla dentro de la respuesta**, en inglés. Así
que pides una continuación en español de ocho palabras y recibes:

> `"Okay, the user wants me to continue the Spanish sentence..."`

**Medido el 2026-08-24 con `qwen3:4b`, en esta máquina:**

| Camino | Resultado |
|---|---|
| Plantilla de chat, razonando | **21 s** y 11.854 caracteres de deliberación para sugerir dos palabras |
| Plantilla de chat, `think: false` | El razonamiento se filtra a la respuesta, en inglés |
| Plantilla de chat, `/no_think` | Lo mismo |
| **Completado crudo (`raw: true`)** | **50 ms**, español limpio, sin preámbulo |

**Why:** porque el problema parece de velocidad y no lo es. La GPU va sobrada
—unos 160 tokens por segundo— y uno pierde el rato bajando el número de tokens
o buscando un modelo más pequeño, cuando lo que sobra es la plantilla de chat.
Con `raw: true` el modelo simplemente continúa la cadena que le das, sin rol de
asistente, sin instrucciones que desobedecer y sin nada que deliberar.

**Corrección del 2026-08-24, el mismo día: `raw` tiene un precio y no es la
velocidad.** En `raw` el modelo **no obedece instrucciones**: continúa un patrón
de ejemplos. Y continuar un patrón es exactamente el mecanismo que inventa
cosas. Con la misma entrada, «el año pasado cambió todo»:

| Vía | Tiempo | Resultado |
|---|---|---|
| `raw` | 0,3–3,7 s | «el año pasado **cambié** todo» — cambia el sujeto |
| chat + razonando | 19–27 s | «el año pasado **cambió** todo» — fiel |

**How to apply:**

- **Si la tarea tiene instrucciones que cumplir (reescribir, corregir, extraer),
  usa la vía de chat CON razonamiento**, aunque tarde veinte segundos. `raw` es
  más rápido y menos fiable, y la diferencia no es de estilo: se inventa cosas.
- **Usa `raw` solo para continuar texto de verdad** — un autocompletado, donde
  no hay instrucción que obedecer y la latencia manda.
- **Razonar reduce la alucinación, no la elimina.** Tres corridas iguales: dos
  fieles, una no. Si el resultado importa, la interfaz tiene que **mostrar qué
  cambió** en vez de pedirle al usuario que lo busque. Ver `web/src/lib/diff.ts`.
- **El precio de `raw` es que no hay instrucciones que el modelo respete.** Con
  poco contexto continúa lo que la cadena más se parezca, y con la palabra
  suelta «corto» devolvió `= float(input("Corto: "))` — código Python. Hay que
  filtrar la salida y exigir un mínimo de contexto.
- Al filtrar, **usa caracteres y no palabras clave**: `def` está dentro de
  «definitivamente» e `import` dentro de «importante». (El autocompletado que
  motivó esto se borró después; la lección sobre filtrar en español no.)
- El modelo se descarga solo tras unos minutos sin uso: la siguiente llamada
  paga ~2,7 s. Cargarlo la primera vez costó 27,7 s.

Ver [[ADR-006-local-language-model-for-text]] y
[[python-stdout-is-not-utf8-on-windows]].
