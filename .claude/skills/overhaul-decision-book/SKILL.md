---
name: overhaul-decision-book
description: "Phase 1 of the Overhaul Kit: fork a base version, understand it with evidence, and build an audited decision book — the single reference of WHAT changes in the new version and WHY. Point-by-point audit ritual with the user, machine-checked consistency via bundled validator. Output in the conversation language."
argument-hint: "[path-to-base-version] [--resume (continue an audit in progress)]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
---

When this skill is invoked (also as `/overhaul-decision-book`, or routed from `/overhaul-kit`):

# Phase 1 — The Decision Book

The decision book answers **what changes and why**. It does NOT answer *which files
change and how* — that is the action book (phase 2). Keeping those apart is
load-bearing: mixing them produced, in this studio's own history, decisions justified
by code that did not exist.

Every rule below was paid for. Where a rule has a story, the story is compressed into
one line so future maintainers don't relitigate it.

## 0. Preconditions

- **The base version is forked and inert.** A full copy lives inside the new
  project's root (e.g. `ProjectV2/`), keeps its own `.git`, and is listed in the new
  project's `.gitignore`. It is reference material: the skill NEVER edits it.
- **Raw inputs are persisted before anything else.** Whatever the user supplies
  (legal comments, field observations, wireframe images, fix lists) gets transcribed
  into ONE accumulator file immediately — images and chat messages do not survive
  the session, and the transcription is usually the only surviving record.
  ⚠️ If the accumulator lands in a purgeable directory (`.tmp/`), warn the user it is
  NOT regenerable and offer `docs/`. Respect their choice, but record it in the
  session state so no routine cleanup deletes it.

## 1. Understand the base version — evidence, not memory

Map the fork before writing a single decision:

1. If the **`graphify`** skill/CLI is available, build the fork's graph:
   `graphify update <fork>` (AST-only, local, no API cost — 227 files take seconds)
   → outputs `<fork>/graphify-out/{graph.json, GRAPH_REPORT.md, graph.html}`. Query
   with `graphify explain "<node>" --graph <fork>/graphify-out/graph.json` and
   `graphify path "<A>" "<B>" --graph ...`.
   **If graphify is NOT installed**, offer it via `AskUserQuestion` — it is a
   software install that touches the network (uv installer, PyPI), so it ALWAYS
   needs the user's fresh yes. On yes, run the bundled idempotent bootstrap:
   `bash .claude/skills/overhaul-kit/scripts/ensure-graphify.sh`
   (installs uv if missing → graphifyy → detects blocked Windows shims → writes
   wrappers → verifies). On no, fall back without friction to
   **`repo-scan --blueprint`** (deterministic extractor). If neither: manual mapping
   via entry points + import tracing with Grep. Note which tier was used.
   ⚠️ The AST graph misses **cross-language links that pass through data files**
   (a JSON contract read by two test suites yields zero nodes) — verify contract/
   fixture relationships with Grep regardless of tier.
2. Read the fork's own living docs (ADRs, session logs, benchmarks, backlogs) —
  they carry measured numbers the new book must cite instead of re-deriving.
3. **Distrust the fork's documentation on any claim that matters.** Precedent: three
   documented privacy guarantees, zero existed in code. The rule is *"grep the
   function before repeating the claim"* — every factual claim the book makes about
   the base version must be verified against the base code or marked `(sin verificar)`.

## 2. Scaffold the book

Create `docs/vN-decision-book.md` (conversation language) with this structure — the
same one battle-tested in Starmatch V3:

```
# VN Decision Book — <Product>
> Qué es / Qué NO es (no es roadmap, ni backlog, ni ADR — es el insumo de esos tres)
> Estado: <qué bloques están auditados> · Última revisión: <fecha> · Sesión: <n>

## Índice de cambios — todo VN en una página
  (one-line per point, per thematic block, with build-priority emoji)

## Cómo funciona <Product>, de punta a punta
  (3-5 Mermaid diagrams: pre-event/offline flow · user journey · boot/startup
   sequence · component topology. These earn their keep: in practice they
   describe the system better than prose.)

## Cómo leer las prioridades  (legend — see hard rules below)

# Bloque A · <theme> ... # Bloque N · <theme>
  (### X-NN · title — **STATUS · PRIORITY** sections)

# Resumen de prioridades
  (los cimientos · P0 table · P1 · P2 · sin construcción propia · abiertos ·
   fuera de alcance)
```

## 3. Hard rules — each one prevents a documented failure

1. **Every point carries TWO labels: decision state AND build priority.**
   `DECIDIDO 2026-07-31 · P0`. They are different things — a decided matrix is not a
   built matrix. One-label books drop decided items from the queue; that undercount
   (17 vs 23 blockers) is the same error class that once left an estimate 5× off.
2. **Superseded designs are DELETED, not archived.** The user's standing rule:
   *"lo importante es el último veredicto."* No tombstones, no "de dónde venía"
   subsections. A book that keeps the old design next to the new one forces a full
   read to know which one governs — and produced three title-vs-body divergences.
   What survives is only a constraint that still governs, rewritten AS the constraint.
3. **Numbers are identity. Never reassigned, never reused.** A point absorbed by
   another is deleted; its number is retired. Cross-references get repointed in the
   same edit (grep for the retired ID — zero live references may remain).
4. **Counts are never maintained by hand.** After every editing session run the
   bundled validator (step 5). The summary is regenerated against the real sections;
   if summary and detail disagree, the detail wins and the summary is rebuilt.
5. **Each repeated argument lives in ONE section**; everywhere else points to it
   (`→ C-02`). Five arguments repeated in full across sections is how a 1.7k-line
   book stops being maintainable.
6. **Sections stay sorted by number within each block.** New points go in numeric
   position, not at the end.
7. **Titles are updated in the same edit as the body — in BOTH directions.** A
   section titled ABIERTO whose body says ✅ DECIDIDO is a booby trap for the next
   reader (`W-TITLE`). **The mirror is worse and easier to miss: a body that still
   carries an open marker while the title says nothing** (`W-OPEN`). Precedent: C-04
   sat like that from the day it was written — a P0 whose engine design was undecided,
   invisible to anyone reading titles and the summary, while the summary meanwhile
   asserted the book had exactly one open decision. **A point that is decided except
   for one loose end says so in its title** (`… · ⏳ 1 punto sin cerrar: <qué>`), and
   appears in the summary's open list.
8. **Never rewrite the book wholesale from a script.** `open(path, "w")` truncates
   before writing; a failed write leaves zero bytes, and living docs are usually
   uncommitted exactly when edited. Use Edit for point changes; for bulk moves,
   write to a scratchpad file, verify, then copy over.
9. **A point can never be more binding than the point that delivers it.** When a
   point's only delivery vehicle is another point, say so in its body with the
   marker `**Se entrega dentro de X-NN**` (or `**Entregado por:** X-NN`) and make the
   vehicle's priority **at least as strict**. Precedent: B-06 (P0 — counsel requires
   the terms reachable from every screen) was delivered inside D-12 (P1, a nav menu).
   Both were labelled correctly and the counts were right; the book was still wrong,
   because any scope cut reading the list would have dropped the P1 menu and taken a
   legal obligation with it. Counting cannot catch this — the validator now can
   (`E-DEP`), but only because the dependency is written down. **Ask "if this point
   were cut, what else dies with it?" for every point whose delivery lives elsewhere.**
   An inverted dependency the user accepts on purpose is recorded with the book's
   existing `riesgo asumido` wording in the same section, which downgrades `E-DEP` to
   a warning — accepted, never silent.

## 4. The audit ritual — where the book earns its authority

The book is DRAFT until every point has been audited **with the user, point by
point**. This ritual is the part that worked unchanged in practice:

For each point: read it → state your own opinion (agree / object, with evidence
from step 1) → propose concrete wording → confirm via `AskUserQuestion` (options:
apply as proposed / variant / user decides differently / skip). Apply immediately —
never batch approved edits for later.

- When the user decides against your objection, record the point as
  **RIESGO ASUMIDO, no resuelto** with the user's textual reasoning. The
  resolved/assumed distinction exists because a risk once read as "fixed" caused two
  contradictory audits months later.
- When your opinion rests on a claim about the base code, **verify it first** (in
  the audited book of record, three out of three code checks changed a decision).
- Mid-audit drift discovered (stale summary, dead refs)? Fix it NOW, not at block
  end — auditing over a self-contradicting document doubles every verification.

## 5. Validate — the exit gate

```
python .claude/skills/overhaul-decision-book/scripts/validate_book.py docs/vN-decision-book.md
```

Pure stdlib, read-only, exit 1 on errors. It checks: summary counts vs real
sections · index ↔ section existence both ways · references to retired IDs ·
**inverted priority dependencies** (rule 9) · title-status vs body-status divergence
**in both directions** (rule 7) · numeric ordering · index emoji vs title priority. **The book is "audited" only when
the validator is green AND every point carries a decision state.** Paste the validator
tally into the session log.

The phase hands off to `/overhaul-action-book` only at that gate. Open decisions
may remain (they get an ⏳ and block only their own action-book entries, not the
phase).

## Self-anneal

When an audit surfaces a failure mode this skill does not guard against: fix the
book, then add the guard HERE (a hard rule, or a validator check) in the same
session. This file is the accumulated scar tissue of every overhaul it has run.
