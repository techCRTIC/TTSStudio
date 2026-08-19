---
name: team-new-feature
description: "End-to-end pipeline for a new feature in an app or website. Producer plans → technical-director signs off → relevant lead → specialists build → qa-tester verifies → doc-keeper logs."
argument-hint: "<feature-description> [--app=<name>] [--no-adr]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Task, Workflow, AskUserQuestion
---

When this skill is invoked:

## 1. Parse Arguments & Validate

- `<feature-description>` (required) — natural-language description of the feature.
- `--app=<name>` (optional) — which app/site. If omitted, infer from the working directory or ask.
- `--no-adr` (optional) — skip the ADR step (only for cosmetic/non-architectural features).

If `<feature-description>` is missing, ask the user for it via `AskUserQuestion`.

## 2. Gather Context

Read in parallel:
- `production/session-state/active.md`
- `directives/project-overview.md`
- `.claude/docs/technical-preferences.md`
- `directives/architecture/` — index of existing ADRs

## 3. Run Plan Phase (deterministic workflow) & Confirm with User

The pipeline runs as the deterministic workflow `.claude/workflows/team-new-feature.js`
(producer → technical-director → domain lead, with validated structured outputs),
split in two modes around the user's approval gate.

Invoke:

```
Workflow({ name: 'team-new-feature',
           args: { mode: 'plan',
                   feature: '<feature-description>',
                   context: '<2-5 line summary of project-overview + technical-preferences gathered in step 2>' } })
```

Render the returned plan inline — framing, acceptance criteria, technical-director
verdict (+ ADR skeleton if any), lead's approach and specialist task list.

Use `AskUserQuestion`:
- `[A] Approve plan and build (Recommended)`
- `[B] Modify the plan` — take the user's adjustments, edit the plan object accordingly (or re-run plan mode with the refined feature description), and re-confirm.
- `[C] Cancel`

**Note on the collaboration protocol:** this approval gate replaces the
per-specialist "May I write this file?" prompts — inside the build workflow,
specialists write directly, but only ever against a plan the user explicitly
approved here.

## 4. Run Build Phase (deterministic workflow)

**Design domains (MANDATORY pre-step):** if the approved plan's `primary_domain`
is `frontend` or `design` (or `mobile` with UI surface), BEFORE invoking build
mode engage the mandatory design suite — `impeccable`, `ui-ux-pro-max`,
`emil-design-eng`, `design-taste-frontend`, plus relevant derivatives per
`.claude/docs/global-skills-map.md` § 1. Distill the task-relevant guidance into
a concise design brief (10–25 lines: typography, spacing, color system, motion,
anti-patterns to avoid) and attach it as `plan.design_guidance`. The workflow
injects it into every specialist prompt. Skipping this on UI work is a protocol
violation.

```
Workflow({ name: 'team-new-feature',
           args: { mode: 'build', feature: '<feature-description>', plan: <approved plan object from step 3> } })
```

The workflow handles: parallel specialists (worktree isolation only when >1
file-mutating task), then per-criterion QA with an adversarial second check on
every reported failure. It returns `{files_modified, implementations, blocked,
qa: {verdict: PASS|CONCERNS|FAIL, criteria}}`.

If the result reports `used_worktrees: true`, surface that the specialists'
changes live in separate worktrees and must be consolidated at the git
checkpoint (step 6).

Then:
- Git Checkpoint gate — see Step 6 below.
- `Task(doc-keeper)`: "Log this feature in session-log.md. If `technical-director` flagged ADR, ensure the ADR file exists. If git-lead committed and pushed (step 6), include the commit hash and PR URL."

## 5. Synthesize and Report

Collect all outputs. Render a final summary:

```
=== Feature: <feature-description> ===
Status: SHIPPED / BLOCKED
Files modified: [list]
ADR: [path if any]
qa-tester verdict: PASS / CONCERNS / FAIL with notes
Next: [follow-up if any]
```

Update `production/session-state/active.md` with key decisions made. Ask user permission first.

## 6. Git Checkpoint (conditional)

After qa-tester reports PASS in step 4:

Use `AskUserQuestion`:

> "qa-tester signed off. Do you want git-lead to handle the commit strategy for these changes now?"
> - `[A] Yes — run /team-git-checkpoint now (Recommended)`
> - `[B] No — I'll handle it manually`

If user picks A: invoke `team-git-checkpoint` passing context (feature description, files modified, qa-tester verdict). Do NOT pass `--release` unless the feature completes a release.

If user picks B: skip silently and continue to step 7.

## Patterns Used

This skill implements the **New App Feature** pattern. See `.claude/docs/agent-coordination-map.md`.