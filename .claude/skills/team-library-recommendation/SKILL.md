---
name: team-library-recommendation
description: "Pick the best library for a specific need. librarian researches and shortlists with tradeoffs, the relevant lead decides, doc-keeper writes an ADR. Use for any non-trivial dependency choice."
argument-hint: "<need-description> [--domain=frontend|backend|mobile|devops|design|data]"
user-invocable: true
allowed-tools: Read, Glob, Grep, WebFetch, WebSearch, Task, AskUserQuestion
---

When this skill is invoked:

## 1. Parse Arguments & Validate

- `<need-description>` (required) — what the library is for, e.g., "form validation in a React app", "Postgres ORM for Node", "GSAP-friendly scroll animation lib".
- `--domain=<X>` (optional) — narrows which lead makes the final call. If omitted, infer from need-description or ask.

If need-description is missing, ask the user.

## 2. Gather Context

Read in parallel:
- `.claude/docs/technical-preferences.md` (current allow-list + stack defaults)
- `directives/architecture/` (existing ADRs that may already cover this)

Check: does an existing ADR already settle this? If yes, surface it and ask the user if they want to override.

## 3. Spawn librarian for Research

`Task(librarian)`: "Research the best library for: '<need-description>'. Constraints: must be compatible with our default stack (see technical-preferences.md). Output a shortlist of 2-4 options. For each, list: maturity (stars/last commit), bundle size, learning curve, key tradeoff, why-pick-this, why-NOT-pick-this. Do NOT pick a winner — that's the lead's job."

## 4. Confirm Shortlist with User Before the Lead Decides

Render the shortlist inline. Ask the user via `AskUserQuestion`:
- One option per shortlisted library (max 3-4)
- Each option's `description` shows the tradeoff in 1-2 lines
- `[Other / brainstorm with me]` if the user wants to discuss

If the user picks a library directly, skip step 5 (decision is made). If user picks "brainstorm", switch to colleague mode: surface 2-3 angles you (the orchestrator) think matter most, ask follow-ups, propose a pick.

## 5. Spawn the Relevant Lead for the Decision

`Task(<domain>-lead)`: "Given the librarian's shortlist [paste] and the user's preference [if any], make the call. Justify in 2-3 sentences why this pick over the others."

## 6. Spawn doc-keeper for the ADR

`Task(doc-keeper)`: "Write an ADR at `directives/architecture/ADR-<NNN>-<slug>.md` capturing: Context, Decision, Status (Accepted), Consequences. Use Michael Nygard format. Reference the librarian's shortlist as appendix."

Per collaboration protocol, ask the user "May I write this ADR to `<path>`?" before doc-keeper writes.

## 7. Update technical-preferences

If the chosen library is a new addition to the stack, append it to the "Allowed Libraries" section of `.claude/docs/technical-preferences.md`. Ask permission first.

## 8. Final Report

```
=== Library Decision ===
Need: <need-description>
Chose: <library-name> (vN.N)
Over: [other shortlisted libs]
Rationale: [lead's 2-3 sentences]
ADR: directives/architecture/ADR-<NNN>-<slug>.md
```

## Patterns Used

This skill implements the **Library Recommendation** custom pattern. See `.claude/docs/agent-coordination-map.md`.