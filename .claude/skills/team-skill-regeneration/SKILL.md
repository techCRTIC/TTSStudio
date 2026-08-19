---
name: team-skill-regeneration
description: "Regenerate or improve an existing skill in Skills/. skill-curator analyzes the gap, skill-author edits, qa-tester validates by dry-run, doc-keeper logs. Handles both targeted regen and 'this skill is broken' triage."
argument-hint: "<skill-name> [--reason=<why>] [--dry-run]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Write, Edit, Task, AskUserQuestion
---

When this skill is invoked:

## 1. Parse Arguments & Validate

- `<skill-name>` (required) — name of the skill to regenerate. Must exist in `Skills/<skill-name>/SKILL.md`.
- `--reason=<why>` (optional) — short description of what's wrong or missing. If omitted, ask the user.
- `--dry-run` (optional) — propose changes but do NOT write to disk.

Validate: `Glob` for `Skills/<skill-name>/SKILL.md`. If not found, fail with the list of available skills.

## 2. Gather Context

Read in parallel:
- `Skills/<skill-name>/SKILL.md` (the target)
- Skills/<skill-name>/** (any auxiliary files)
- `Skills/skill-creator/SKILL.md` (the meta-skill for skill authoring)
- `.claude/docs/technical-preferences.md` (skill model routing)

## 3. Spawn skill-curator for Gap Analysis

`Task(skill-curator)`: "Read `Skills/<skill-name>/SKILL.md` and the user's reason: '<reason>'. Analyze: (1) what's the actual gap or issue? (2) what's the minimal change that would fix it? (3) what's a more ambitious refactor that would future-proof it? Output a structured gap report with both options."

## 4. Confirm Approach with User

Render the gap report inline. Use `AskUserQuestion`:
- `[A] Apply the minimal fix (Recommended)`
- `[B] Apply the ambitious refactor`
- `[C] Cancel — let me think`

If user picks Other, take their guidance and re-run skill-curator with the refined direction.

## 5. Spawn skill-author for the Edit

`Task(skill-author)`: "Apply the chosen approach to `Skills/<skill-name>/SKILL.md`. Show the full diff inline before writing. Per collaboration protocol, ask 'May I write this to Skills/<skill-name>/SKILL.md?' before any Write/Edit."

If `--dry-run`, instruct skill-author to ONLY show the diff, not write.

## 6. Spawn qa-tester for Validation

`Task(qa-tester)`: "Validate the regenerated skill by dry-running its description against its argument-hint and pipeline. Check: (1) frontmatter is valid YAML, (2) referenced agents exist in the roster, (3) tool list is reasonable, (4) the skill's purpose is achievable with the listed tools. Report PASS / CONCERNS / FAIL."

## 7. Spawn doc-keeper for the Log

`Task(doc-keeper)`: "Log this regeneration in `directives/session-log.md`: which skill, what changed, why, qa-tester verdict. If the skill change affects a downstream skill or pattern, also flag it."

## 8. Final Report

```
=== Skill Regenerated: <skill-name> ===
Approach: minimal-fix / ambitious-refactor
Diff: [N lines added, M removed]
qa-tester verdict: PASS / CONCERNS / FAIL
Logged: directives/session-log.md
```

## Patterns Used

This skill implements the **Skill Regeneration** custom pattern (insight: skills, like code, deserve self-anneal). See `.claude/docs/agent-coordination-map.md`.