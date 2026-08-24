# Active Session State

<!-- cierre -->
## 🧾 Cierre — Sesión 4 · 2026-08-24
El resumen completo de cada sesión vive en `directives/session-log.md`, y es lo
que la próxima sesión lee primero. Este archivo es el detalle recuperable.
<!-- /cierre -->

---

**Status:** sesión 4. La mitad backend de la Fase 3 está **construida, revisada
y verificada en verde**. Rama `main`, **22 archivos SIN COMMITEAR**, con una
**propuesta de 4 commits escrita y esperando el sí del usuario**.
**Last update:** 2026-08-24

## ⏳ Lo único que bloquea ahora mismo
El usuario tiene que **aprobar o corregir la propuesta de commits** (más abajo).
No se ha ejecutado ningún `git add` ni `git commit`.

## Current task
**Fase 3 del roadmap — guiones largos.** Mitad backend/determinista: **hecha**.
Las seis decisiones están razonadas en
**[ADR-007](../../directives/architecture/ADR-007-long-scripts-segment-orchestration.md)**.

**Criterio que no se puede romper** (criterio de salida del roadmap): si el
troceo devuelve **un solo tramo**, el camino debe ser idéntico al de hoy — ni un
proceso de Python de más. De ahí que el umbral viva en dos lenguajes y exista un
cuarto verificador de costura que salta si dejan de coincidir.

## Verificación (corrida por el orquestador, después de los arreglos)
| Qué | Resultado |
|---|---|
| Suite de la app (`npm test` en `web/`) | **136 pasan, 0 fallan, 0 saltadas** |
| `pytest` (`execution/tests/`) | **21 pasan** |
| Los **cuatro** `execution/check_*.py` | **los cuatro salen 0** |
| `npx tsc --noEmit` · `npm run lint` | **limpios** |
| `qa-tester` del pipeline | **PASS, 9 de 9 criterios** |
| `security-reviewer` | **CONCERNS, nada bloqueante — sus 5 arreglos YA aplicados** |

## Los cinco arreglos de seguridad, ya dentro
1. **Tope de 200** al borrado en lote y a la lista de unión, más **techo
   absoluto de 10 min** al plazo de la unión. Sin esto, una petición con 10.000
   tramos pedía un plazo de once horas con Python acumulando audio en memoria.
2. **`index` y `subfolder` en cada resultado del borrado**: dos tramos con el
   mismo nombre en carpetas distintas eran indistinguibles, y el llamador podía
   leer «borrado» de un archivo que seguía en el disco.
3. **`redactRoot()` en `comfy-files.ts`**: los mensajes de error devolvían al
   navegador rutas absolutas con el nombre de usuario del sistema dentro.
4. **`numpy` declarado** en `pyproject.toml`: se usaba de prestado, entrando
   como dependencia de otra.
5. **Tests nuevos**: travesía dentro del lote, tope de tamaño, y posición.

## Propuesta de commits, pendiente de aprobación
**A `main`, sin rama** — las once funcionalidades anteriores de tamaño parecido
fueron directas, no hay a quién pedirle un PR en un proyecto de una persona, y
esa revisión ya la hicieron QA y seguridad. Cuando empiece la mitad de pantalla
(varias sesiones), ahí sí conviene una rama.

| # | Tipo | Qué agrupa |
|---|---|---|
| 1 | `feat(segments)` | Los dos scripts deterministas + arnés de pytest + `pyproject.toml`/`uv.lock` |
| 2 | `feat(segments)` | El cuarto verificador de costura + `SEGMENT_MAX_CHARS` en `tts.ts` |
| 3 | `feat(segments)` | `comfy-files.ts`, las dos rutas de `segments/`, el borrado en lote, y sus tests |
| 4 | `docs` | ADR-007, roadmap, backlog, bitácora, `active.md`, memoria |

Los textos exactos los tiene `git-lead` (agente `a20c1a4885598d83d`); si se
pierden, se regeneran pidiéndoselos con este mismo contexto.

## Lo que existe ahora
| Ruta | Qué es |
|---|---|
| `execution/tts_trocear_guion.py` | Parte el guión por frases. `MAX_CHARS = 600` (ese nombre lo lee el verificador por regex) |
| `execution/tts_unir_tramos.py` | `--verificar` un tramo contra el bug de loop · `--unir` con pausas de 0,28 s y 0,65 s |
| `execution/check_segment_contract.py` | Cuarto verificador: compara `MAX_CHARS` con `SEGMENT_MAX_CHARS` |
| `execution/tests/` | `conftest.py` + los tests de los dos scripts |
| `web/src/lib/tts.ts` | Ganó `SEGMENT_MAX_CHARS = 600` |
| `web/src/lib/comfy-files.ts` | Ganó `pieceOutputPath()` y `redactRoot()` |
| `web/src/app/api/segments/{verify,join}/` | Las dos rutas que invocan el script |
| `web/src/app/api/takes/route.ts` | El borrado acepta lista, con tope y trazabilidad por posición |
| `web/tests/segments-{verify,join}.test.ts`, `web/tests/takes.test.ts` | Sus tests |

## ⚠️ Dos cosas que mordieron esta sesión y volverán a morder
1. **Un especialista borró el trabajo de otro.** Puso una imitación de
   `tts_unir_tramos.py` en su ruta real para probar lo suyo y al limpiarla se
   llevó el original. Se recuperó desde `agent-*.jsonl`. Memoria:
   [[especialistas-en-paralelo-se-pisan-las-dependencias]].
2. **B-008, cinco mordiscos.** Segundo disparador conocido además de la tecla
   pulsada: el nombre con que JavaScript lee sus variables de entorno. Llegó a
   impedir escribir la bitácora que describe el fallo. Rodeo: crear el archivo
   con otra herramienta y ejecutarlo después.

## ⚠️ El error de documentación corregido
Los documentos decían que la app seguía al motor **por websocket**. **No
existe.** `web/src/app/page.tsx:213-255` consulta `/api/status/:promptId` cada
700 ms, y el motor solo reporta posición en cola o ejecución — por eso
`StatusLine.tsx` se niega a pintar barras. Corregido en `directives/roadmap.md`.

## Siguiente paso
1. **Ejecutar los cuatro commits** en cuanto el usuario apruebe.
2. **La mitad de frontend**: el bucle que secuencia los tramos reusando
   `submit`/`statusOf`, el «tramo K de N» —sin porcentaje, que el motor no lo
   sabe—, los campos opcionales del tipo `Take`, y `deleteTake` llamando al
   borrado en lote (que ya lo espera, con `index` y `subfolder`).
3. Pendiente de medir: **B-015**, la longitud mínima bajo la cual no se aplica
   la banda de caracteres por segundo.

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

## Abierto / sin verificar
- **La mitad de frontend de la Fase 3**, entera.
- **Nada de esto se ha probado contra el motor real** — los tests usan audio
  sintético y fixtures, no una generación de verdad.
- **Ventanas angostas:** sin verificar desde la sesión 1.
- **B-008** (cinco mordiscos), **B-009**, **B-010**, **B-011**, **B-012**,
  **B-013**, **B-014**, **B-015**, **B-007**.
- **PII:** el nombre de una persona real aparece en ADRs y bitácora de sesiones
  anteriores. `security-reviewer` confirmó que **no aparece en nada de lo no
  commiteado** de esta sesión. Privado hoy; exposición si el repo se publicara.
- **`voces.json`** sigue en el directorio del motor con el `ref_text` dentro.
- **Riesgo latente anotado por seguridad:** `tts_unir_tramos.py --salida` es una
  primitiva de escritura arbitraria por diseño (recibe la ruta y obedece). Hoy
  **no es alcanzable desde el navegador**, porque la ruta siempre la calcula
  `pieceOutputPath()`. Cualquier llamador futuro debe respetar eso.
- **Aviso para frontend-lead:** `tts_trocear_guion.py --archivo` lee cualquier
  archivo. Cuando se conecte la pantalla, el texto debe viajar por argumento o
  por entrada estándar, **nunca como nombre de archivo desde el cliente**.

## Decisiones, con dónde viven
| Decisión | Dónde |
|---|---|
| La procedencia vive en un archivo junto a la voz | `ADR-005` |
| Lo determinista lo hace código; el modelo solo lo que es criterio | `ADR-006` |
| Dónde vive la orquestación de tramos y quién escribe la pieza unida | `ADR-007` |
