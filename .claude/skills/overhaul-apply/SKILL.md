---
name: overhaul-apply
description: "Phase 3 of the Overhaul Kit: execute a validated action book entry by entry — bring each block WITH its dependency closure, adapt it per the quoted decision, test it, check it off, checkpoint it. Selective porting: nothing marked NO TRAER crosses over, nothing unlisted crosses silently. Resumable: the action book's checkboxes ARE the progress state."
argument-hint: "[path-to-action-book] [--entry X-NN (apply a single entry)] [--dry-run (report the next entry's plan without touching files)]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Write, Edit, AskUserQuestion
---

When this skill is invoked (also as `/overhaul-apply`, or routed from `/overhaul-kit`):

# Phase 3 — Apply

Executes the action book. The core property: **the new codebase only ever contains
code that an audited decision put there.** No block crosses from the base version by
inertia — inertia is how a base accumulates duplicated pipelines, decided-but-never-
built layers, and guarantees that exist only in prose.

## 0. Entry gate

- `validate_actions.py` green over the action book (all paths real, verdicts valid).
- The user reviewed the NO TRAER list in phase 2.
- Working tree clean, or the user explicitly accepts applying over a dirty tree.
- **The new version has its own dependency graph, and this phase is where it is born.**
  Phase 1 built the BASE's graph (`<base>/graphify-out/`) to decide what to fork — that
  one answers questions about the base and is the wrong graph the instant code lands
  here. Build the new version's at ITS root before the first entry:
  `graphify update <new-root>`, and confirm `graphify-out/` is gitignored there — it is
  a derived artifact, megabytes of JSON that must never reach a diff.
  **If graphify is NOT installed**, offer it via `AskUserQuestion` — it is a software
  install that touches the network (uv installer, PyPI), so it ALWAYS needs the user's
  fresh yes, and **this phase's pre-granted write authority does NOT extend to it**
  (project Data Protection §4). On yes, run the bundled idempotent bootstrap:
  `bash .claude/skills/overhaul-kit/scripts/ensure-graphify.sh`. On no, proceed without
  a graph — the entry's own closure list is the authority anyway.
  From here the graph has a lifecycle: **apply creates
  it, `/close` rebuilds it every session** (`team-session-close` step 8). Skip the
  create step and the rebuild rule has nothing to rebuild: the new codebase stays
  unmapped exactly while it is growing fastest, and each session's fresh files are
  absent from the map that the next session queries.

## 1. The apply loop — one entry at a time, in book order

Entries execute top to bottom (they are dependency-ordered by construction). Per
entry:

1. **Re-read the entry and its quoted decision.** The quote is the spec. If the
   entry is BLOCKED (its decision still ⏳), skip it and say so — never resolve an
   open decision implicitly by writing code.
2. **Bring the closure, not the file.** For TRAER INTACTO / MODIFICADO: copy the
   piece PLUS everything its entry lists as closure — tests, fixtures, contract
   files, invariant docs. A module without its shared contract is two future
   implementations diverging silently. The BASE's graph (`graphify explain "<node>"
   --graph <base>/graphify-out/graph.json`) narrows what a piece drags with it — but
   it never proves a closure: HTTP seams, links through data files, and dynamic
   `import()` produce no edges. The entry's own closure list stays the authority.
3. **Adapt** (TRAER MODIFICADO / ESCRIBIR DE CERO): make exactly the change the
   entry describes. Scope discipline is hard here: an adjacent improvement you
   notice is a NOTE for the backlog, not an edit.
4. **Test before check-off.** Run the tests the entry names (plus the suite of
   whatever module was touched). No green, no checkbox. If the base tests don't
   cover the change, write the missing test as part of the entry — a guarantee
   without a test is prose.
5. **Check off**: flip the entry's `[ ]` to `[x]` in the action book **in the same
   edit session** as the code change. The checkboxes are the resume state — a
   crashed or interrupted apply resumes by reading them, not by archaeology.
6. **Checkpoint**: offer a commit per entry or per coherent group (user approves
   the message; never commit without approval). Small checkpoints are what make a
   bad adaptation cheap to revert.

## 2. Gates that outrank progress

- **security-reviewer** BEFORE committing any entry touching auth/identity, personal
  data, external input, third-party APIs, or infra/secrets. A qa PASS is not
  sufficient for those (project Data Protection §6).
- **qa-tester** (or the project's test suite) for everything else.
- **Paid calls**: if an entry involves code that calls paid APIs, the project's
  envelope rules apply to any live test — dry-run by default, `--live` only
  explicitly, abort-don't-truncate.

## 3. When reality disagrees with the action book

This WILL happen — treat it as signal, not friction:

- **A needed file isn't in any entry** → stop. That is a phase-2 bug: add the entry
  (or extend the closure) in the action book FIRST, with its verdict and decision
  pointer, then continue. Never bring an unlisted file "just for now" — that is the
  inertia channel this kit closes.
- **An entry's instruction doesn't fit the code found** (the base moved, the map
  was wrong) → fix the action book entry, note the correction, re-run
  `validate_actions.py`, continue. The action book must remain true at all times:
  it is the record a future session resumes from.
- **The fix reveals a bug CLASS** → sweep for siblings before moving on (the same
  discipline as the studio's root-cause rule), and record the class in the entry.

## 4. Progress reporting

After each entry (or on `--dry-run`): entry ID · verdict executed · files touched ·
tests run and their tally · checkbox state `N aplicado / M pendiente`. At session
end the tally goes into the session log, and the next entry's ID goes into the
"siguiente paso concreto".

## 5. Exit

The overhaul is applied when every non-BLOCKED entry is `[x]`, the full test
suite is green, **and the declared-vs-real careo is green**:

```
python .claude/skills/overhaul-apply/scripts/validate_applied.py <action-book> <repo>
```

Full-tree mode: every tracked file must be accounted for by a verdict row (or
be exempt harness/state prose). Its `E-UNDECLARED` is the machine check for
this phase's core property — "the new codebase only ever contains code that an
audited decision put there" — which until this validator existed was enforced
by eyes alone, against the kit's own doctrine. `E-BROUGHT` catches a NO TRAER
that crossed anyway; `W-UNDONE` catches a checkbox flipped without its file
landing. Run it per-session too, with `--base <ref-at-session-start>`, to careo
just that session's diff. First run on the book of record: **33 files with no
verdict row, among them three fresh pieces recorded only in a blockquote** — a
gap the audited, gate-passed book carried invisibly.

Remaining BLOCKED entries are listed by decision ID — they are the
overhaul's open tail, owned by the decision book, not by this phase.

## Self-anneal

Every "reality disagreed" event from step 3 gets judged at exit: if the same
mismatch class appeared twice, phase 2's skill or validator gains a check for it.
