---
name: team-session-start
description: "Guided onboarding for the start of a session. Queries session state, directives, backlog, roadmap, memory and — when the project has one — the Overhaul Kit action book, reading whole only what is small and bounded-reading what grows. Producer + doc-keeper synthesize a status briefing and propose next actions. Alias: /start."
argument-hint: "[--quick (skip docs-stale check)]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Task, AskUserQuestion
---

When this skill is invoked (also as `/start`):

## 0. Bootstrap the full project scaffold (runs before everything else)

Every check below is conditional ("if missing") — this step is idempotent and
silently skips anything that already exists. Collect what was actually created
and notify the user with the exact list at the end of the step.

**0a. CLAUDE.md trio** — if `CLAUDE.md` is missing in the project root:
1. Read `.claude/templates/CLAUDE.template.md`
2. Write the template content to three files in the project root:
   - `CLAUDE.md`
   - `AGENTS.md`
   - `GEMINI.md`

**0b. Git repository** — if `git rev-parse --git-dir` fails:
1. Run `git init`
2. Write `.gitignore` with at least:
   ```
   .tmp/
   .env
   credentials.json
   token.json
   node_modules/
   ```

**0c. Directives** — if `directives/` is missing, create it with two skeletons:
- `directives/session-log.md` — header explaining it is the chronological
  session log (newest entry on top) plus one initial entry in the template's entry format
  (`## YYYY-MM-DD — Project scaffolded`, with today's date) recording that the
  scaffold was created by `/start`.
- `directives/project-overview.md` — the mandatory sections from
  CLAUDE.template.md § Project Documentation, each with a `_TBD_` placeholder:
  Project identity · Current status · Vision · Architecture & stack ·
  Key design decisions · Directory structure · Known constraints.

**0c-bis. Backlog** — if `directives/backlog.md` is missing, create it with a
header explaining it is the queue of future ideas / deferred todos (NOT the
active task → `active.md`, chronology → `session-log.md`, or current state →
`project-overview.md`; `producer` drives priorities, `doc-keeper` maintains it),
the entry format (`## B-NNN — title` + a **Status** line: `idea` / `en curso` /
`✅ hecho`), and zero entries.

**The file MUST be scaffolded with the two-section ordering rule in its header, and
with both section headings already present (empty).** A backlog that grows without
this becomes unreadable by ~20 entries — open and closed items interleave, and the
queue stops being a queue. It is far cheaper to be born ordered than to be reordered
later:

```markdown
**Cómo leer este archivo.** Dos secciones, y solo dos:

- **`## Abiertas`** — todo lo NO hecho, ordenado por número de menor a mayor. Esto es la cola.
- **`## Cerradas`** — todo lo hecho o descartado, ordenado por número. Se conservan por sus
  `[[links]]` y por el razonamiento que documentan. **No son pendientes. No reabrir sin evidencia
  nueva.** Sus títulos van marcados `## ✅ B-NNN — [CERRADO]` para que se distingan de un vistazo.

**Los números nunca se reordenan ni se reasignan**: son identidad, y hay `[[links]]` cruzados que
apuntan a ellos. Un ítem que se cierra **se mueve de sección, no cambia de número**.

Al cerrar un ítem: cambia su `**Status:**` a `✅ hecho` (o `❌ sin objeto`), marca el título como
`## ✅ B-NNN — [CERRADO] título`, y **muévelo a `## Cerradas`** conservando su número.
```

**0c-ter. Roadmap** — if `directives/roadmap.md` is missing, create it with a
header explaining it is the phased roadmap + scope of the project (the "where
this is going"), owned by `producer` and distinct from backlog (parking lot →
`backlog.md`), chronology (`session-log.md`), current state (`project-overview.md`),
and single decisions (ADRs). Skeleton content:
- an **Alcances (scope)** section with `_TBD_` in-scope / out-of-scope placeholders;
- a **Fases** section with a `_TBD_` placeholder (each future phase = pregunta it
  answers · entregables · exit criteria);
- near the top, the sentinel line `<!-- roadmap-checkpoint: pending -->`.
The Stop hook uses that sentinel: once a foundational decision (an `ADR-*.md`)
exists but the roadmap is still a skeleton, it prompts the orchestrator to propose
a programming roadmap. Flip the sentinel to `done` (roadmap filled) or `declined`
(user declined) to silence it. See the Roadmap Checkpoint pattern in
`.claude/docs/agent-coordination-map.md`.

**0d. Session state** — if `production/session-state/active.md` is missing,
create it with minimal initial state, **already carrying the closing-summary
block** (CLAUDE.md § Living documentation). Scaffold it with the sentinels in
place, exactly as the backlog is scaffolded pre-ordered: a structure that is born
correct is never retrofitted under time pressure.
```markdown
# Active Session State

<!-- cierre -->
## 🧾 Cierre — sin sesiones aún
Proyecto recién inicializado por `/start`. Nada que resumir todavía.
**Siguiente paso concreto:** elegir la primera tarea (paso 5 de `/start`).
<!-- /cierre -->

---

**Status:** freshly scaffolded — no active task yet.
**Last update:** <today's date> (by /start bootstrap)
## Current task
None. Run /start step 5 to pick one.
```
The `<!-- cierre -->` block is what the SessionStart hook injects into the next
session's context, and `stop-state-reminder.sh` blocks the Stop while it is
missing. At session close, rewrite it (in Spanish, detailed but simple) so it
recaps what the session did, decided, and left pending.

**0e. Working directories** — create if missing:
- `execution/` (with an empty `.gitkeep`)
- `.tmp/`

**0e-bis. Project memory** — if `memory/MEMORY.md` is missing (project root —
NOT inside `.claude/`, which must stay a portable, project-agnostic harness),
create it with the standard header (one line per memory; what belongs here vs
session-log/project-overview/ADRs; curated by doc-keeper) and zero entries.
Memory files are one fact per file with frontmatter (`name`, `description`,
`metadata.type: gotcha | constraint | preference | reference`), body with
**Why:** and **How to apply:**, `[[name]]` links between related memories.
Per-agent memory (`memory/agents/<agent>/MEMORY.md`) is NOT scaffolded — it's
created lazily the first time an agent records a domain learning.

**0f. Global skill dependencies** — read the "Required global skills" manifest
in `.claude/docs/global-skills-map.md` and compare it against the skills
actually available in this session (the available-skills list the harness
provides; do NOT rely on globbing directories — plugin skills don't live in a
folder you can scan):
- Any **REQUIRED** skill missing → prominent warning in the briefing:
  "⚠ Missing required global skill: `<name>` — install it; the studio depends
  on it (see global-skills-map.md)."
- Any **RECOMMENDED** skill missing → one soft line listing them.
- Skills available in the session but absent from the map → flag the drift
  for `skill-curator` (one line, no action needed).

**Notification format:** "Scaffold check — created: [list]. Already present: [list or 'everything else']." If nothing was created, say nothing and continue.

## 1. Parse Arguments

- `--quick` → skip the doc-staleness check (doc-keeper sub-step), trust current state.

## 2. Gather Context — QUERY STATE, DO NOT READ WHOLE DOCUMENTS

🔴 **The governing rule of this step, and it is a budget rule: `/start` produces a
BRIEFING, and a briefing needs the STATE of a document, not its text.** Reading
these files whole is what this step used to do, and it was measured on a real
project at **~85.000 tokens spent before the user's first instruction** — most of
it chronology and detail that only matters once a task is chosen. Same project,
querying instead of reading: **~25.000, reporting MORE than before.** Whenever a
document below can answer "how much is open and what is next" through `grep`,
`git`, or reading a bounded head section, do that. Read a document whole only
when the session's actual task turns out to need it.

**Read whole (all small, all load-bearing at every session):**

1. `production/session-state/active.md` — machine-recoverable state. **The single
   most important file in this step**; it is written to be read whole.
2. `memory/MEMORY.md` — memory index (one line per memory; read individual
   memory files only when their description matches the session's work)
3. `.claude/docs/orchestrator-mindset.md` — the 8 reasoning rules
4. `.claude/docs/agent-roster.md` — who is available
5. `.claude/docs/agent-coordination-map.md` — workflow patterns
6. `directives/roadmap.md` — phases + scope. If it still holds an unresolved
   `roadmap-checkpoint: pending` sentinel and an ADR exists, plan to propose a
   programming roadmap this session.

**Read BOUNDED (these grow without limit — never read them whole here):**

7. `directives/session-log.md` — **the newest 1-2 entries only.** The file is
   append-only chronology and reaches tens of thousands of tokens; everything
   older than the last session is history, and history is what it is FOR.
8. `directives/project-overview.md` — **the identity + current-status sections
   only** (through "Estado actual"). The per-session chronology below that
   duplicates `session-log.md` by design.
9. `directives/backlog.md` — **the priority map at the top of `## Abiertas`, plus
   the `## B-` headings** (`grep -E '^## B-'`). That is the queue. Individual
   entries are read when one is about to be worked, not at session start.

**Do NOT read:**

- ❌ `CLAUDE.md` — the harness already injects it into the system prompt. Reading
  it here is a pure duplicate of context you are guaranteed to already hold.

Also run `Glob` for `Skills/*/SKILL.md` to enumerate available skills, and
`git status --short` + `git log --oneline -10` for working-tree context.

### 2-bis. The action book, IF this project has one

Projects that came from a fork via the Overhaul Kit carry an action book — the
ordered build plan, whose per-entry state lives in its own checkboxes. **Nothing
else in the loop surfaces it**, so its open work is invisible at session start
unless someone happens to run `/overhaul-apply`. That was a real, measured gap:
a project was found with **27 of 41 entries open, 15 of them P0**, none of it
reported by any session briefing.

**Find it gitignore-aware, never with a bare glob:**

```bash
git ls-files "*-action-book.md"
```

🔴 **`find` / `Glob` are WRONG here and this is not hypothetical.** A fork checked
out inside the project (`StarmatchV2/`, `legacy/`, …) is normally git-ignored but
still on disk, and a bare glob reports ITS documents as if they were the
project's. That exact bug already shipped once in this harness — the roadmap
check fires on ADRs living inside an ignored fork. `git ls-files` respects
`.gitignore` by construction, so the class of bug cannot recur.

**If the command returns nothing: skip this sub-step ENTIRELY — no note, no
warning, no line in the briefing.** Most projects never had a fork and an action
book is not something they are missing. Silence is the correct output.

**If it returns a path**, query it (do NOT read it — it is one of the largest
documents in the project):

```bash
grep -E '^## [A-Z]-[0-9]+' <path>          # every entry heading carries its state
```

Each heading looks like `## C-02 · Algoritmo nuevo — P0 · [ ] pendiente`, so one
grep yields the code, the title, the priority and the checkbox. Report:

- counts by state (`[x]` done / `[~]` half / `[ ]` not started) and how many are **P0**
- the next entries worth starting — and ⚠️ **`[~]` does NOT mean "code missing"**:
  several are half-done because a caller or a checkbox is missing, not the
  mechanism. Say so rather than presenting them as unstarted work.

⚠️ **The action book and `backlog.md` are SEPARATE registries and neither feeds
the other.** `/overhaul-apply` ticks boxes in the book; it does not create backlog
entries. Where they overlap they may use different numbers for the same subject,
so **never resolve a bare `X-NN` against the wrong document** — check which one it
came from first.

## 3. Synthesize Status (parallel Tasks)

Spawn two subagents in parallel:

- `Task(producer)`: "Read the gathered context (active.md + session-log + project-overview). Synthesize: (1) where the studio left off, (2) what is open, (3) what the obvious next 1-3 actions are. Output as a markdown briefing under 300 words."
- `Task(doc-keeper)`: "Read project-overview.md and session-log.md. Verify project-overview describes a state from within the last 2 sessions. If stale, list specifically what's outdated. Output a 'Doc health' section."
  - SKIP if `--quick` was passed.

## 4. Render Briefing

Combine the two outputs into a single briefing rendered inline:

```
=== Personal AI Dev Studio — Session Briefing ===

[producer's synthesis]

=== Doc health (doc-keeper) ===
[doc-keeper's findings, or "skipped (--quick)"]

=== Build plan (action book) ===        ← OMIT THIS WHOLE BLOCK if there is none
<n> of <total> entries open — <n> P0 · [x] <n> done · [~] <n> half · [ ] <n> not started
Next worth starting: <2-4 entry codes with titles>
[⚠️ any half-done entry that is blocked on something other than code]

=== Available skills ===
[grouped: existing skills in Skills/, plus team-* in .claude/skills/]

=== Skill dependencies (global-skills-map.md) ===
[REQUIRED: all present ✓ / missing: list with ⚠]
[RECOMMENDED missing: soft list, or omit if complete]
[unmapped skills detected: list for skill-curator, or omit]

=== Working tree ===
Branch: <branch>
Uncommitted: <count> files
Recent commits:
  <last 5>
```

## 5. Confirm Next Action with User

Use `AskUserQuestion` with options derived from producer's "next 1-3 actions" suggestion:

- One option per suggested action (max 3)
- Always include: "Other / let me decide"

The user's pick becomes the active task; update `production/session-state/active.md` accordingly (asking permission first per collaboration protocol).

## Patterns Used

This skill implements the **Project Onboarding** pattern (custom for Personal AI Dev Studio). It is the canonical first step of any session — never skip it on the first turn.

See `.claude/docs/agent-coordination-map.md` for the full pattern catalog.