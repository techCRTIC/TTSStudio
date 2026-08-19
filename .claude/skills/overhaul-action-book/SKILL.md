---
name: overhaul-action-book
description: "Phase 2 of the Overhaul Kit: translate an audited decision book into an action book — every decision mapped to the real files it touches, with an explicit bring/modify/write-new/do-not-bring verdict per code block, ordered by dependencies. Every path machine-verified against the base repo before it is written down. Output in the conversation language."
argument-hint: "[path-to-decision-book] [path-to-base-version]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
---

When this skill is invoked (also as `/overhaul-action-book`, or routed from `/overhaul-kit`):

# Phase 2 — The Action Book

The decision book says **what and why**; the action book says **where and how**. It
is the bridge from "decidido" to "construible": a build plan a coding agent can
execute almost mechanically, where every change is anchored to a real file and
justified by a quoted decision.

Origin: this document type was specified by the user as *"un libro de instrucciones
que discrimina e incluye qué cosas hay que traer de la versión anterior y qué se
modifica, armado textualmente, cada cambio ligado a cada decisión."*

## 0. Entry gate — do not start early

- The decision book's validator is **green** and its audit is complete (user
  confirmed). Building an action book over a half-audited decision book means
  rewriting it when the pending points land — the exact rework this kit exists to
  avoid. Points still marked ⏳ ABIERTO are carried into the action book as
  explicitly **BLOCKED** entries, never silently resolved.
- The base version fork exists and is readable.

## 1. Map the base code — the graph is the ground truth

Build the dependency picture the verdicts will lean on, best tier available:

1. **`graphify`**: queryable knowledge graph, deterministic AST parsing. If not
   installed, offer it (user's explicit yes required — network install) and run
   `bash .claude/skills/overhaul-kit/scripts/ensure-graphify.sh` (idempotent
   bootstrap bundled with the kit). Build/refresh with `graphify update <base>`; then
   `graphify explain "<node>" --graph <base>/graphify-out/graph.json` for a piece's
   connections (line-anchored) and `graphify path "<A>" "<B>" --graph ...` for
   reachability between two pieces.
2. **`repo-scan --blueprint`**: deterministic extractor — dependency map, pipeline,
   entry points.
3. **Manual**: entry points + import tracing with Grep. Slower, same rigor.

Record which tier produced the map. Two questions the map must answer per block:
*what does this block drag with it?* (closure) and *does anything still reach this
block?* (liveness).

⚠️ **Three known blind spots of the AST graph — all measured, none hypothetical.**
Each one has already produced a real defect in a real book:

1. **Links through data files produce zero nodes.** The E.164 phone contract JSON,
   read by both the Python and Node suites, is invisible to `path`. Closure lists
   for contracts, fixtures and config files are ALWAYS cross-checked with Grep
   (`grep -rn "<filename>" <base>`), whatever the graph says. A NO TRAER verdict
   justified only by "no incoming edges in the graph" is insufficient for data files.
2. **Dynamic imports are invisible.** Measured: `start.mjs` reports zero
   dependencies in the graph while executing `await import('./tunnel.mjs')`. Grep
   for `import(` before trusting a "this file depends on nothing" reading.
3. **Surveying by artefact location misses the code that BUILDS it.** A deliverable
   stored in `docs/` whose generator lives in `production/webapp/` was written down
   as "does not exist in the base" — the generator was 424 lines and produced that
   exact file. **When an entry's deliverable is an artefact (a PDF, a report, an
   export), search for its producer by output filename**
   (`grep -rn "<artefact-name>" <base>`), not by the directory it lands in.

## 2. Structure of the action book

Create `docs/vN-action-book.md` (conversation language). One entry per decision
point that has build work (`P0/P1/P2`); points marked *sin construcción propia*
get a one-line entry stating where their effect materializes.

```markdown
## <ID> · <título del punto>  — <P0|P1|P2> · [ ] pendiente

**Decisión (cita):** "<the operative sentence, quoted verbatim from the decision book>"
**Veredicto de código:**

| Pieza de la versión base | Acción | Cómo queda |
|---|---|---|
| `execution/phone_e164.py` + `execution/fixtures/phone_e164_vectors.json` | TRAER MODIFICADO | extender reglas de país; el contrato viaja con el módulo |
| `production/webapp/client/screens/not-found.js` | NO TRAER | inalcanzable en el flujo nuevo (evidencia: grafo, 0 referencias entrantes) |
| — | ESCRIBIR DE CERO | pantalla "Sobre nosotros" (no existe en la base — verificado) |

**Depende de:** <IDs que deben aplicarse antes> · **Tests que lo cubren:** <paths>
```

The four verdicts, exhaustive and mutually exclusive per piece:

| Verdicto | Significa | Obligación |
|---|---|---|
| **TRAER INTACTO** | copy as-is | closure travels too (tests, fixtures, contracts) |
| **TRAER MODIFICADO** | copy then edit | state textually WHAT changes and per WHICH decision |
| **ESCRIBIR DE CERO** | new code | state why nothing in the base serves as seed |
| **NO TRAER** | stays behind | state the evidence (dead, superseded, or out of scope) |

## 3. Hard rules

1. **Every path is verified against the base repo before it is written down.** A
   deterministic check, not a belief: the audited book of record once ordered
   "adapt the About screen" — the screen did not exist. Run the bundled check
   after every editing session:
   `python .claude/skills/overhaul-action-book/scripts/validate_actions.py <action-book> <base-repo>`
   Green = every cited path exists (or is explicitly marked `ESCRIBIR DE CERO`).
2. **A block travels with its closure.** Bringing a module without the contract
   file both test suites read is how two implementations diverge silently. The
   closure of a piece = its imports + its tests + its fixtures/contracts + the
   docs that define its invariants. The graph computes this; the entry lists it.

   **`W-CLOSURE` now enforces the import half of this automatically** (added
   2026-08-04, after four gaps survived a human read of a book that had already
   passed its phase-2 exit gate — one of them a test helper imported by **twelve**
   brought suites). The validator walks the graph's `imports` edges out of every
   BROUGHT path and demands a verdict row for each target. It needs no setup: the
   graph is auto-discovered at `<base>/graphify-out/graph.json`, and when absent
   the check is skipped without failing the run.

   It closes one subclass, not the whole class. It follows edges **out of files the
   book already brings**, so a file that was never mapped at all is invisible to it,
   and it sees **static imports only** (blind spots 2 and 3 above). Grep still
   closes those.
3. **NO TRAER requires evidence, not vibes.** "Unreachable in the graph", "decided
   in an ADR but never implemented", "superseded by decision X-NN". Base versions
   accumulate exactly this (a whole realtime layer once existed only as an ADR —
   zero code), and porting blindly means debugging code nobody uses.
4. **Entries are ordered by dependency, foundations first.** Topological order from
   the graph: contracts and shared modules before their consumers. The apply phase
   executes top to bottom.
5. **Decision quotes are verbatim, with their ID.** Paraphrase drifts; the quote
   plus the pointer lets the executor re-read context without re-deriving it.
6. **The action book inherits the decision book's discipline:** two labels, stable
   IDs, superseded content deleted, counts machine-checked, no wholesale script
   rewrites of the living file.

## 4. Exit gate

The action book is ready for `/overhaul-apply` when: validator green (all paths
real) · every P0 decision has its entry · every entry has a verdict for each piece
it names · dependency order is explicit · the user has reviewed the NO TRAER list
(it is the easiest place to silently lose something they wanted).

Present the NO TRAER list to the user via `AskUserQuestion` before declaring the
phase done — deletion by omission must be a decision, not an accident.

## Self-anneal

Every mismatch the apply phase later discovers (a path that moved, a closure that
was incomplete) is a bug in THIS phase's process — fix the action book, then add
the missing check here or in `validate_actions.py`.
