---
name: overhaul-kit
description: "Umbrella for the version-overhaul pipeline: fork a base version → build an audited decision book (WHAT changes and why) → derive an action book (WHERE, file by file, bring/modify/write-new/do-not-bring) → apply it selectively with tests and gates. Detects which phase the project is in and routes to the right sub-skill. Use for any 'V(N) → V(N+1)' upgrade of an existing codebase."
argument-hint: "[--status (report phase and pending work, change nothing)]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, AskUserQuestion, Skill
---

When this skill is invoked (also as `/overhaul-kit`):

# The Overhaul Kit

Three phases, three artifacts, one invariant: **at every step, what exists is
consistent with what was decided** — machine-checked, not assumed.

```
fork the base (inert, gitignored, own .git)
   │
   ▼
① /overhaul-decision-book      WHAT changes and WHY
   docs/vN-decision-book.md    · audited point-by-point with the user
   gate: validate_book.py green + audit complete
   │
   ▼
② /overhaul-action-book        WHERE — decision → files → verdict
   docs/vN-action-book.md      · TRAER INTACTO / MODIFICADO / DE CERO / NO TRAER
   gate: validate_actions.py green + user reviewed the NO TRAER list
   │
   ▼
③ /overhaul-apply              DO — entry by entry, closure included,
                               tests before check-off, checkboxes = resume state
   gate: validate_applied.py green — the declared-vs-real careo
         (full tree at exit; --base <ref> per session)
```

The kit was distilled from a real overhaul (Starmatch V2 → V3) where each phase was
first done by hand and each guard below exists because its absence cost real work.

## Phase detection

Decide where the project stands by evidence, then route:

1. No decision book (`docs/*decision-book*.md` absent) → **phase 1** from scratch.
   Confirm the fork exists first; if there is no fork, that is step zero.
2. Decision book exists → run its validator. Red, or audit incomplete (header
   says blocks pending) → **phase 1 resume** (`--resume`).
3. Decision book green + audited, no action book → **phase 2**.
4. Action book exists → run its validator. Red → **phase 2 resume**. Green with
   `[ ]` pendientes → **phase 3** at the first unchecked entry.
5. Everything green and checked → run `validate_applied.py` (full tree). Green
   → report done; remaining BLOCKED entries listed. Red → the book and the repo
   disagree: fix the BOOK first (add the missing verdict rows), then re-run.

With `--status`: print the phase, both validators' tallies, and the next concrete
step — change nothing.

Always confirm the detected phase with the user via `AskUserQuestion` before
routing (one question, options: proceed / different phase / just status).

## Division of truth — what lives where

| Question | Lives in | Never in |
|---|---|---|
| What changes and why, priorities, open risks | decision book | action book (quotes it) |
| Which files, which verdict, closure, order | action book | decision book |
| Progress of the build | action book checkboxes | chat memory or session state alone |
| Session-scale state (where we stopped, next step) | the project's living docs (`active.md`, session log) | the books |

A correction discovered downstream always flows UPSTREAM first (apply finds a wrong
path → fix the action book; action book finds an unverified claim → fix the
decision book), then work continues. The books must be true at all times: they are
what a future session — possibly a different model — resumes from.

## Cross-phase rules (inherited by all three sub-skills)

- **Evidence before belief:** claims about the base code are verified against the
  base code. Three out of three code checks in the source overhaul changed a
  decision.
- **Deterministic where possible:** counting, path-checking and consistency are
  scripts (bundled, stdlib-only, read-only), never eyeballs. Eyeballs missed a
  17-vs-23 blocker undercount; the script didn't.
- **Superseded content is deleted**, numbers are identity, two labels per point
  (decision state · build priority).
- **Living docs are edited with Edit/Write, never rewritten wholesale by scripts**
  (`open(path,"w")` truncates first; a failed write once left a living doc at zero
  bytes).
- **Code mapping tiers:** `graphify` skill/CLI (knowledge graph, deterministic AST;
  `graphify update <base>` builds, `explain`/`path` query) → `repo-scan --blueprint`
  → manual Grep tracing. Use the best available, record which. Whatever the tier:
  **contract/fixture/data-file relationships are always Grep-verified** — the AST
  graph measurably misses links that pass through data files.
- **Self-provisioning with consent:** the kit bundles
  `scripts/ensure-graphify.sh`, an idempotent bootstrap (uv → graphifyy →
  blocked-shim detection → wrappers → verify) that makes the kit portable to any
  machine/harness. The contract is strict: **the script never runs without the
  user's fresh, explicit yes** — it installs software and touches the network,
  and this kit exists partly because an installer once modified privileged
  config without asking. Skills ask via `AskUserQuestion`; a "no" degrades
  gracefully to the next mapping tier, never nags twice in a session.

## Relationship to the studio

Inside the Personal AI Dev Studio this kit composes with the existing machinery: the
audit ritual uses `AskUserQuestion` per the collaboration protocol, apply-phase
gates delegate to `security-reviewer`/`qa-tester`, checkpoints go through
`/team-git-checkpoint`, and session boundaries through `/start` · `/close`. Outside
the studio the kit still works — the gates degrade to running the project's test
suite and asking the user directly.
