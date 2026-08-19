---
name: team-session-close
description: "Guided close for the end of a session — the mirror of /start. Reconstructs what the session actually did from evidence (git + file mtimes + active.md), then writes the session-log entry with its <!-- cierre --> block, refreshes active.md, syncs project-overview/backlog/roadmap/memory, and offers a git checkpoint. Alias: /close."
argument-hint: "[--quick (skip project-overview + memory sweep)] [--no-git (skip the checkpoint offer)]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, Task, AskUserQuestion
---

When this skill is invoked (also as `/close`):

The close is a **ritual**: same steps, same order, every time. Its purpose is that
the next session — possibly weeks from now, possibly a different model — can pick up
without archaeology. The Stop hook (`stop-state-reminder.sh`) is only a backstop; it
catches a missing summary, never a *shallow* one. This skill is what makes it real.

**Hard rule — evidence before belief (orchestrator-mindset rule 1).** Every claim
written into the log must come from something observed in step 2: a diff, a file, a
test run, an explicit user decision in the transcript. Never write "implemented X"
because X was planned. If a thing was attempted and left half-done, that is exactly
what the log says.

## 0. Preconditions

**0a. Scaffold present?** If `production/session-state/active.md` OR
`directives/session-log.md` is missing, the project was never bootstrapped. Run
`/start` step 0 (bootstrap only — skip its briefing and its AskUserQuestion), then
continue here. Say in one line that you did so.

**0b. Anything to close?** If the session produced no file changes, no decisions,
and no user-visible outcome (e.g. it was pure Q&A), say so and offer:
"Nothing to persist — close without writing? [yes / log it anyway]". A log entry
that says "consulta sin cambios" is still worth writing if a decision was reached.

## 1. Parse arguments

- `--quick` → skip step 5 (project-overview staleness) and step 6 (memory sweep).
  Steps 2-4 (including 2-bis, the careo) are NEVER skippable: they are the close.
- `--no-git` → skip step 7's checkpoint offer entirely.

## 2. Reconstruct the session from evidence (read/run in parallel)

Do not reconstruct from memory of the conversation alone — memory of a long session
is exactly what compaction degraded. Gather:

1. `git status --short` — what is uncommitted right now
2. `git log --oneline` since the session's first commit (or `-10` if unclear)
3. `git diff --stat` (unstaged) + `git diff --cached --stat` (staged) — the shape of the change
4. `production/session-state/active.md` — what the session declared it was doing
5. `directives/session-log.md` — the newest entry (its number, its date, its stated next step)
6. `directives/backlog.md` — open items, to see which the session closed or added to
7. `directives/roadmap.md` — the `roadmap-checkpoint` sentinel state
8. Files modified this session that git does not see (untracked or non-repo):
   `find . -type f -newer directives/session-log.md -not -path "./.git/*" -not -path "./node_modules/*" -not -path "./.tmp/*"`

**Reconcile.** Where `active.md` claims something the diff does not show, the diff
wins and the discrepancy itself goes in the log ("se planeó X, quedó sin hacer").

## 2-bis. Careo — the declared-vs-real pass

Two deterministic passes over step 2's evidence, before drafting anything:

1. **Run every `execution/check_*.py`** the project has (the seam checkers —
   CLAUDE.md § Self-annealing extends to seams; none is fine, say so in one
   word). Paste each checker's one-line tally. A red checker does not block
   the close — it blocks the close from being SILENT about it: the failure is
   named in "Estado al cerrar" with its file, and usually becomes the
   "Siguiente paso concreto".
2. **Account for the diff.** Every file in step 2's evidence lands in one of
   three buckets, and the third is the one this pass exists for:
   - **touched and expected** — the session's stated work → the entry's bullets
   - **planned but untouched** → "se planeó X, quedó sin hacer" (rule above)
   - **touched but never mentioned** → each gets its own line in the entry:
     what changed and why. An unexplained collateral edit is a mystery the
     next session inherits as a bug; if it cannot be explained, that itself
     is the finding — record it as such, never drop it.

   In an overhaul project (an action book exists), the accounting is the kit's
   careo — run it instead of eyeballing:
   `python .claude/skills/overhaul-apply/scripts/validate_applied.py <action-book> . --base <ref-at-session-start>`

## 3. Draft the session-log entry — the load-bearing step

Compose a new entry for `directives/session-log.md`, **prepended at the TOP** of the
file (newest-on-top is enforced: the SessionStart hook injects the file's *first*
`<!-- cierre -->` block as the next session's first impression).

Session number = previous entry's number + 1. Date = today.

Exact format (contract in CLAUDE.md § Living documentation — the ASCII sentinels are
locale-proof and load-bearing; the heading between them is free-form):

```markdown
## YYYY-MM-DD — <título breve de la sesión>

<!-- cierre -->
## 🧾 Cierre — Sesión N · YYYY-MM-DD

**En una frase:** <lo único que esta sesión cambió del proyecto>

**Qué se hizo**
- <3-6 bullets, lenguaje llano, sin jerga interna ni identificadores de código sueltos>

**Qué se decidió y por qué**
- <la decisión, luego la razón — incluyendo las alternativas descartadas>

**Estado al cerrar:** <rama · árbol limpio/sucio · tests · qué quedó a medias>
**Siguiente paso concreto:** <la única acción con la que arranca la próxima sesión>
<!-- /cierre -->

**Time:** HH:MM (aprox.)
**User request:** ...
### Actions taken
- ...
### Decisions
- ...
### Outcomes
- ...
### Next steps / open questions
- ...
```

**Quality bar for the `<!-- cierre -->` block — this is where closes usually fail:**

- **Language: Spanish** (§ Conversation language). Its only reader is the user.
- **Understandable without opening any other file.** Spell out what a term means
  instead of naming it. `directives/backlog.md` → "la lista de ideas pendientes".
  A bullet the reader must go look up is a failed bullet.
- **"Siguiente paso concreto" is one action, not a theme.** "Seguir con auth" fails.
  "Escribir el endpoint POST /login en `execution/api.py`, ya está el esquema" passes.
- **"Estado al cerrar" must name what is half-done**, by file. Half-done work that
  isn't named is work the next session silently rediscovers as a bug.
- **Decisions carry the rejected alternative.** A decision without its discarded
  option gets re-litigated in three sessions.

Show the drafted entry inline and ask: "¿Escribo esta entrada en
`directives/session-log.md`?" (collaboration protocol — approval before Write).

## 4. Refresh `production/session-state/active.md`

`active.md` is the **detailed, machine-recoverable** state — not a second copy of the
cierre block. Rewrite (do not append) so it reflects the state *at close*:

- **Status** + **Last update** (today, "by /close")
- **Current task** — what is in flight, or `None` if the session closed clean
- **Key decisions made** — with pointers to ADRs / files
- **Next steps** — the concrete step from the cierre, plus its immediate follow-ons
- **Open questions / blockers** — anything waiting on the user or on an external answer
- **Where things are** — the files touched this session, so the next session doesn't grep

> 🔴 **"Rewrite, do not append" means the finished session is DELETED from this file,
> not demoted.** Read that literally, because the plausible-looking alternative —
> relabelling the outgoing session as `## 📕 Sesión anterior (Nª)` and writing the new
> one above it — is how this file turns into a second chronology written for the wrong
> reader. Each close copies the pattern it finds in the file rather than the rule
> written here, so the drift compounds silently until `active.md` **exceeds the read
> limit** at the next session's start. The file whose only job is fast recovery becomes
> too big to read.
>
> Before deleting, check whether anything in the outgoing section lives ONLY there
> (measurements, commit hashes, gotchas) and migrate it into that session's entry in
> `session-log.md` first — that is careful work, not a copy-paste.
>
> `stop-state-reminder.sh` enforces this (invariant 1-quater): it **blocks** the Stop if
> `active.md` carries a `Sesión anterior`-style heading or exceeds 400 lines. If it
> fires, the fix is migrate-then-delete — never raise the ceiling.

This file is what makes the Stop hook's freshness invariant pass. Writing it last,
after the log, keeps its mtime newer than the project files.

## 5. Sync the surrounding documents (skipped by `--quick`)

Run these as a `Task(doc-keeper)` when there is real work to do; inline if trivial.

**5a. `directives/project-overview.md`** — the rule is that it must never describe a
state older than 2 sessions. If this session changed the stack, the architecture, the
status, or the directory structure, update it now. Staleness here is the single most
expensive kind of doc drift: it is the one file a fresh agent reads.

**5b. `directives/backlog.md`** — two directions:
- Items the session **closed**: flip `**Status:**` to `✅ hecho` (or `❌ sin objeto`),
  mark the title `## ✅ B-NNN — [CERRADO] título`, and **move it to `## Cerradas`
  keeping its number**. Numbers are identity; they are never reassigned.
- Items the session **deferred**: anything the user said "para después / luego /
  anótalo" about, plus good ideas that fell outside scope. Add to `## Abiertas` with
  the next free number and enough context to act on later. An idea that only lives
  in the transcript is an idea that dies at compaction.

**5c. `directives/roadmap.md`** — if the sentinel is still `roadmap-checkpoint: pending`
and an `ADR-*.md` now exists, this is the moment: propose the roadmap
(`AskUserQuestion`, fases + alcances) rather than letting the Stop hook nag next
session. On accept or decline, flip the sentinel to `done` / `declined`.

**5d. ADRs / changelogs** — if a foundational decision was taken and has no
`ADR-*.md`, flag it (a decision that only exists in the session log will be
re-litigated). Delegate to `technical-director` for the ADR, `changelog-writer` for
user-visible changes.

## 6. Memory sweep (skipped by `--quick`)

Ask once: **did this session teach something a future session needs, that the living
docs will not surface?** Gotchas, learned constraints, project-specific user
preferences. NOT chronology (→ session-log), NOT current state (→ project-overview),
NOT formal decisions (→ ADRs).

If yes, write `memory/<slug>.md` at the **project root** — never inside `.claude/`,
which must stay a portable, project-agnostic harness — with frontmatter (`name`,
`description`, `metadata.type: gotcha | constraint | preference | reference`), a body
with **Why:** and **How to apply:**, and `[[name]]` links. Add one line to
`memory/MEMORY.md`. Prefer updating an existing memory over creating a near-duplicate;
delete any memory this session proved wrong.

## 7. Git checkpoint (skipped by `--no-git`)

If the working tree is dirty, offer the checkpoint rather than assuming it:
`AskUserQuestion` → "¿Consolido el trabajo en git antes de cerrar?"
- **Sí** → invoke `/team-git-checkpoint` (which runs the `security-reviewer` gate
  first when the change touches auth, personal data, external input, third-party
  APIs, or infra/secrets, then `git-lead` proposes the message for approval).
- **No, dejar sucio** → record that explicitly in "Estado al cerrar" so the next
  session is not surprised by uncommitted work.

Never commit without explicit approval. `git push`, tags, and PRs always need a
fresh yes (Data Protection § 4).

## 8. Cleanup + safety pass

- **Did this session touch `.claude/hooks/**`?** Then run
  `bash .claude/hooks/tests/run-all.sh` before the checkpoint and paste the tally.
  Hooks are the only code in the repo that runs on *every* tool call, and a broken
  one fails quietly — it blocks legitimate work or, worse, stops guarding without
  saying so. A hook silently reverted to a pre-fix version looks identical to a
  working one until something it was supposed to catch gets through. If the suite
  fails, the close does not proceed until it is green or the failure is explicitly
  recorded in "Estado al cerrar".
- **Dependency map stale?** If `graphify-out/graph.json` exists at the project root,
  rebuild it: `graphify update .`. It takes seconds and `graphify-out/` is gitignored,
  so it never reaches the diff. CLAUDE.md § Dependency map only says "rebuild BEFORE
  querying" — a just-in-time rule that depends on someone remembering mid-question,
  which is exactly the kind that fails; rebuilding at close means the next session
  inherits a graph that matches the code it is about to read. **No graph at the root →
  skip silently, and never bootstrap one here:** one graph per project, and creating it
  is a deliberate choice, not a close-time side effect. Rebuilding does not promote the
  graph to an authority — its three measured blind spots (HTTP seams, links through
  data files, dynamic `import()`) are unchanged. **Ordering trap:** this step runs
  AFTER step 4 rewrote `active.md`, so `graphify-out/` must be pruned by
  `stop-state-reminder.sh`'s freshness `find` (invariant 1), or every close trips its
  own nudge with the artifact it just regenerated.
- **`.tmp/`** — purge intermediates, especially any containing personal data.
  Everything there is regenerable by definition. Ask before deleting anything that
  looks like it isn't.
- **Secrets/PII check on what you just wrote.** Re-read the new session-log entry,
  `active.md`, and any new memory file, and confirm none contains an API key, token,
  password, or real personal data (names, emails, phones, addresses, IDs, financial
  or health data). If a session involved real PII, the log records *that it happened*,
  never the data. This check is cheap and the failure mode is permanent — the log is
  committed.
- If `.gitignore` is missing any of `.env*`, `credentials.json`, `token.json`,
  `*.pem`, `*.key`, `settings.local.json`, `production/session-logs/`, fix it now.

## 9. Render the close

```
=== Personal AI Dev Studio — Cierre de sesión N ===

<the <!-- cierre --> block, verbatim — this is what the next session will see>

=== Careo ===
  checks ................ N checker(s): verde / ROJO en <archivo> (registrado)
  diff .................. N tocados, todos con cuenta / N sin mencionar → añadidos
=== Documentos actualizados ===
  session-log.md ........ entrada N añadida
  active.md ............. reescrito
  project-overview.md ... actualizado / sin cambios / omitido (--quick)
  backlog.md ............ +N abiertas, N cerradas / sin cambios
  roadmap.md ............ sentinel: pending|done|declined
  memory/ ............... +N memorias / sin cambios
  grafo ................. reconstruido (N nodos, N aristas) / sin grafo (omitido)
=== Estado del repo ===
  Rama: <branch> · <commited | N archivos sin commitear (por decisión)>
=== Pendiente para la próxima ===
  <the "Siguiente paso concreto", repeated — it is the only line that must survive>
```

Then stop. Do not start new work after a close.

## Verification (before you claim the close is done)

The close is complete only when all five are true — check them, do not assume:

1. `directives/session-log.md` starts with the new entry, and its `<!-- cierre -->`
   block is the **first** one in the file.
2. `production/session-state/active.md` mtime is newer than the project files
   changed this session (otherwise the Stop hook blocks and the close was theatre).
3. The "Siguiente paso concreto" names a file or a command — not a topic.
4. Nothing written this session contains a secret or real PII.
5. The careo ran (2-bis): every checker's tally is in the entry, and no touched
   file is left unmentioned.

If (2) fails because an agent wrote a file after `active.md`, rewrite `active.md`
again — it must be last.

## Patterns Used

Implements the **Session Close** pattern — the mirror of **Project Onboarding**
(`team-session-start` / `/start`). Together they bracket every session: `/start`
reads the newest `<!-- cierre -->` block, `/close` writes the next one. The contract
between them is that block, and it is the only thing guaranteed to survive into the
next context window.

See `.claude/docs/agent-coordination-map.md` for the full pattern catalog.
