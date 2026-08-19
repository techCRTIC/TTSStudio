# Backlog Triage & Priority Standard

> Project-agnostic method for organizing `directives/backlog.md` against a milestone.
> Owned by `producer` (priorities) + `doc-keeper` (file maintenance). Portable harness
> artifact — carries **no** project-specific content; "milestone" is a placeholder each
> project fills in (a release, code freeze, launch, sprint, or event).

## Why this exists

The two-section ordering rule (`## Abiertas` / `## Cerradas`) keeps the file *readable*, but
a flat queue still doesn't tell you *what to do next*. By ~20 entries, "which of these matters
for the thing we're shipping?" is unanswerable at a glance. This standard adds a repeatable
**triage** that maps every open item to a decision relative to a named milestone, and **stamps
that decision on the item** so the backlog stays self-describing — no separate spreadsheet, no
memory required.

## The classification — every open item lands in exactly ONE bucket

Triage always runs against a **named milestone**. Each open `B-NNN` gets exactly one bucket:

1. **In-milestone** — must be built or decided *before* the milestone. Sub-tiered by priority:
   - **P0 — critical / blocking.** The milestone fails without it. There should be few; if
     everything is P0, nothing is.
   - **P1 — high.** Substantial value or risk-reduction; do before the milestone if at all
     possible.
   - **P2 — cheap / minor.** Low-cost correctness, robustness or polish wins; include if time
     allows, and the first to cut if it doesn't.
2. **Gate (operational).** Must be TRUE before the milestone ships, but is **not code to
   freeze** — a deployment-checklist step, a config/secret value, a legal or content sign-off,
   a data check. Kept a distinct bucket so "the code is done" is never mistaken for "we're
   ready to ship."
3. **Deferred.** Real and worth keeping, but intentionally *after* this milestone.
4. **Closed.** Done or moot → moves to `## Cerradas` per the ordering rule. **A decision to NOT
   do something is a close** (`❌ sin objeto` / `❌ fuera de alcance`), never a silent deletion —
   the reasoning and `[[links]]` are preserved.

**Milestone-agnostic.** "Milestone" stands in for freeze / release / launch / sprint / event —
the tiers (P0/P1/P2) and buckets are the standard; the milestone name is per-project. If several
milestones are live at once, tag the tier with the milestone (e.g. `M2 P1`).

## Verify before you triage (non-negotiable)

A backlog entry's own **Status** can be stale — living docs drift, and an item marked "en curso /
not built" may already be done (or the reverse). Before classifying any item whose status is
load-bearing, **verify against the source of truth (the code), not the prose.** For anything
non-trivial, dispatch a **read-only subagent** to confirm and quote `file:line` evidence, then
close stale-but-done items on the spot with a short "verified in code (YYYY-MM-DD)" note. This is
the *Evidence before belief* mindset rule (`.claude/docs/orchestrator-mindset.md`) applied to the
backlog: a triage that trusts stale statuses mis-prioritizes the whole milestone.

## Stamp the decision on the item

Each open item's **Status** line carries its triage tag + date, so the item is self-describing
without opening the map:

```
**Status:** idea — **MILESTONE P0, PRIMERA PRIORIDAD** (triage YYYY-MM-DD: one-line why)
**Status:** idea — **MILESTONE P1** (triage YYYY-MM-DD: …)
**Status:** idea — **MILESTONE P2 (barato)** (triage YYYY-MM-DD: …)
**Status:** idea — **GATE DE EVENTO** (triage YYYY-MM-DD: …)
**Status:** idea — **DIFERIDO post-milestone** (triage YYYY-MM-DD: …)
```

(The label text stays in the project's document language — see CLAUDE.md § Conversation
language. The tier vocabulary — `P0/P1/P2`, `GATE`, `DIFERIDO` — is the portable part.)

## The triage header (one-glance map)

After a triage, put a summary block at the **top of `## Abiertas`** that maps every item to its
tier with `[[links]]`: P0/P1/P2, gates, deliverables, deferred, and the list of items closed this
pass. The header is the priority *map*; the per-item Status stamps are the detail. Keep them in
sync — the header is regenerated each triage, not appended to.

## How to run a triage (the survey method)

1. **Read the whole backlog first** (both sections) so you catch supersessions and `[[links]]`
   before proposing anything.
2. **Go IN ORDER, one item or a small batch at a time.** For each: give the user a short read +
   a recommendation, then let them classify. `AskUserQuestion` with the four buckets as options
   works well — put the recommended option first, labelled `(Recomendado)`.
3. **Verify any load-bearing status against code** before classifying it (§ above). Don't ask the
   user to decide on a premise that might be false.
4. **Apply the moves in ONE pass at the end:** closed → `## Cerradas` (marked
   `## ✅ B-NNN — [CERRADO]`, reasoning preserved, number unchanged), deferred/in-milestone
   stamped, header block written. **Verify counts** (items in == items out) so nothing is lost.
5. **Close with the prioritized plan** — P0 first, then P1, then P2, then gates and deferred.

## When to run one

- Approaching any milestone (freeze, release, launch, sprint boundary, event).
- When the backlog has grown enough that "what's next" is no longer obvious.
- When the user asks to prioritize, clean up, survey, or review the backlog.

`producer` owns the priorities; `doc-keeper` maintains the file, the moves, and the header block.
