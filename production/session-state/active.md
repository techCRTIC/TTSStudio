# Active Session State

<!-- cierre -->
## 🧾 Cierre — Sesión 3 · 2026-08-24
El resumen completo de cada sesión vive en `directives/session-log.md`, y es lo
que la próxima sesión lee primero. Este archivo es el detalle recuperable.
<!-- /cierre -->

---

**Status:** sesión 3 **cerrada limpia**. Rama `main`, árbol limpio, todo
commiteado. 109 tests en verde (ninguno saltado), tipos, lint y compilación
limpios, los tres verificadores de costura en verde. **Nada a medias.**
**Last update:** 2026-08-24 (by /close)

## Current task
Ninguna. La Fase 2 del roadmap quedó terminada.

## Siguiente paso
**Fase 3 — guiones largos.** El motor topa en ~3 minutos de audio y 2048
caracteres por pasada, así que un guión real nunca es una sola llamada: hay que
trocearlo, generar cada tramo y unirlos.

**El primer paso concreto:** leer
`Claude/Investigación/.claude/skills/voz-local/scripts/tts_narrar_largo.py` y
decidir qué parte se trae a `execution/`. Ese script ya resuelve, medido, lo
difícil: trocea por frases completas (cortar a mitad de oración destruye la
entonación de las dos mitades), verifica cada tramo contra el bug de loop y lo
regenera con otra semilla si falla, y une con pausas distintas entre frase y
entre párrafo.

## Decisiones de esta sesión, con dónde viven
| Decisión | Dónde |
|---|---|
| La procedencia vive en un archivo junto a la voz | `ADR-005` |
| El motor manda: sin ficha → «sin procedencia registrada» | `ADR-005` |
| Lo determinista lo hace código; el modelo solo lo que es criterio | `ADR-006` |
| La reescritura razona antes de responder, y nunca se aplica sola | `ADR-006` |
| El guardián contra el invento está en la pantalla, no en el modelo | `web/src/lib/diff.ts` |

## Cómo levantarlo
```
npm start        # desde la RAÍZ. Compila al arrancar: un cambio de código no
                 # se ve hasta reiniciarla.
```
Lo levanta **el usuario**: una tarea de fondo de un agente no sobrevive al turno
([[agent-background-server-dies-with-turn]]). Hace falta **ComfyUI encendido**
y, para el botón de reescribir, **ollama con `qwen3:4b`**.

Nota: el núcleo de ComfyUI está desactualizado (`v0.33.0-23` instalado,
`v0.33.3` disponible). Decisión del usuario cuándo actualizarlo.

## Dónde están las cosas que nacieron en esta sesión
| Ruta | Qué es |
|---|---|
| `web/src/lib/provenance.ts` | La forma del dato de procedencia y sus reglas |
| `web/src/lib/comfy-files.ts` | Ampliado: lee y escribe el archivo de procedencia |
| `web/src/app/api/voices/provenance/` | Editar la procedencia de una voz existente |
| `web/src/app/api/voices/preview/` | Generar la muestra de una voz y recordarla |
| `web/src/lib/python.ts` | El puente compartido a los scripts de `execution/` |
| `web/src/lib/text-quality.ts` | El lado TypeScript de los dos scripts medidos |
| `web/src/lib/llm.ts` | El cliente de ollama. Chat **con razonamiento** |
| `web/src/lib/diff.ts` | Marca las palabras que de verdad cambiaron |
| `web/src/app/api/text/` | `review` (determinista) e `improve` (con modelo) |
| `web/src/components/ImprovePanel.tsx` | El panel de reescritura |
| `web/src/components/ToolRail.tsx` | El raíl de herramientas junto al campo |
| `web/src/components/PanelSlot.tsx` | El espacio de panel que mide y anima su alto |
| `web/src/components/DockButton.tsx` | Los dos botones circulares del escenario |
| `web/src/lib/reveal.ts` | El revelado circular de los cajones |
| `execution/tts_revisar_texto.py` | Traído de la skill `voz-local`, no reescrito |
| `execution/tts_normalizar_texto.py` | Ídem. Números y fechas a forma hablada |
| `execution/check_voice_sidecar.py` | Tercer verificador de costura |
| `execution/migrate_voice_provenance.py` | Trajo la procedencia del legado `voces.json` |

## Abierto / sin verificar
- **Ventanas angostas:** sin verificar desde la sesión 1.
- **B-008:** el hook de secretos bloquea código JavaScript legítimo. Mordió tres
  veces esta sesión. Sin tocar: `.claude/hooks/` exige permiso fresco.
- **B-009:** ¿una semilla transfiere carácter entre textos distintos? Sin medir.
- **B-010:** el normalizador dice «un veintiuno por ciento» donde va «veintiún».
  No se toca aquí para no separar la copia del original de la skill.
- **B-011:** unir las tomas marcadas como buenas con la reescritura.
- **B-012:** la app no instala ollama ni el modelo; degrada con honestidad.
- **B-007:** revisión de acabado y `DESIGN.md` del spinoff, sin hacer.
- **PII:** el nombre de una persona real aparece en ADRs, bitácora y código
  desde sesiones anteriores. Privado hoy; si el repo se publicara, es exposición.
- **`voces.json`** sigue en el directorio del motor con el `ref_text` dentro. Es
  del usuario; la migración no lo tocó.
