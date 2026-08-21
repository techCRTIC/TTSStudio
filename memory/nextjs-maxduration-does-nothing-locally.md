---
name: nextjs-maxduration-does-nothing-locally
description: En Next, `export const maxDuration` no impone ningún límite en una app que corre en local — lo fija la plataforma de despliegue. Escribirlo aquí solo simula un timeout que no existe.
metadata:
  type: gotcha
---

# `maxDuration` no limita nada en local

Al escribir la ruta de transcripción se le puso
`export const maxDuration = 600` para "dejar que una operación larga termine".
No hace nada. Los docs de Next 16 incluidos en `node_modules` lo dicen en su
propia tabla de configuración: el valor por defecto es *"Set by deployment
platform"*, y la descripción aclara que **las plataformas de despliegue** lo
leen de la salida del build.

**Why:** TTS Studio no se despliega en ninguna parte — corre en la máquina del
usuario con `next start`. Así que ese `export` es decorativo, y es peor que
inútil: quien lo lea después va a creer que existe un límite de 600 segundos
gobernando la petición, y va a buscar ahí cuando algo se cuelgue. El límite real
tiene que estar en el proceso que hace el trabajo.

**How to apply:**
- No pongas `maxDuration` en este proyecto. Si una operación necesita un tope,
  impleméntalo donde de verdad se puede cortar — como el `setTimeout` que mata
  el proceso en `web/src/lib/transcribe.ts`.
- Más en general: **este Next no es el que recuerdas.** `web/AGENTS.md` lo
  advierte y tiene razón — en la versión 16 también desaparecen `dynamic`,
  `revalidate` y `fetchCache` cuando Cache Components está activo (en este
  proyecto no lo está, por eso `dynamic = "force-dynamic"` sigue siendo válido).
  Antes de usar cualquier opción de configuración de ruta, léela en
  `web/node_modules/next/dist/docs/`.

Relacionado: [[react-inline-style-fights-imperative-dom]] — la misma clase de
error, creer una API en vez de comprobarla.
