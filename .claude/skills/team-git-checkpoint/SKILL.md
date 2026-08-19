---
name: team-git-checkpoint
description: "Git strategy checkpoint. git-lead analyzes working-tree state, decides branching + commit structure, proposes commit message(s), and — after user approval — commits, optionally pushes, and opens a PR if on a feature branch."
argument-hint: "[--release] [--push] [--branch=<name>]"
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Task, AskUserQuestion
---

When this skill is invoked:

## 1. Parse Arguments

- `--release` — treat as a release commit: after committing, invoke changelog-writer and propose a semver tag.
- `--push` — after approved commit, push to remote and open a PR if on a feature branch.
- `--branch=<name>` — override git-lead's branch name decision with this name.

If no arguments, git-lead decides all options from working-tree analysis.

## 2. Spawn git-lead for State Analysis + Strategy

`Task(git-lead)`: "Analyze the current working tree. Run: (1) `git status`, (2) `git diff --staged`, (3) `git diff HEAD`, (4) `git log --oneline -10`, (5) `git branch -a`. Then produce a structured Git Strategy Report:

```
=== Git Strategy Report ===
Current branch: <branch>
Staged: <N files>
Unstaged: <N files>
Untracked: <N files>

Branching decision:
  - [Stay on <branch> / Create <type>/<scope>]
  - Rationale: <1 sentence>
  - devops-lead consult needed: [YES/NO] — [reason if YES]

Commit plan:
  Commit 1:
    type(scope): <short description>
    Body: <2–4 lines>
    Files: [list]
  Commit 2 (if applicable): ...

Push recommendation: [YES/NO]
  - Target: <remote/branch>
  - PR: [YES/NO] — title: <title>

Release flag: [YES/NO]
  - If YES: proposed tag: v<X.Y.Z>
```
"

## 3. (Conditional) Consult devops-lead

If git-lead's report flags "devops-lead consult needed: YES":

`Task(devops-lead)`: "git-lead is about to create branch `<name>`. Does this branch name conflict with or trigger any CI/CD pipeline matchers? If yes, propose an alternative name."

Incorporate devops-lead's response before presenting to user.

## 3-bis. (Conditional) Security Gate — security-reviewer

If the working-tree diff touches **auth, personal data, external input handling,
third-party API calls, or infra/secrets** (per CLAUDE.md § Data Protection §6),
the commit MUST pass the security gate before proceeding:

`Task(security-reviewer)`: "Review the current working-tree diff (`git diff HEAD`)
for secret leakage, PII handling, injection, insecure dependencies, and untrusted
egress. Output verdict PASS / CONCERNS / BLOCK with prioritized fixes."

- **PASS** → continue to step 4.
- **CONCERNS** → render the concerns inline; the user must explicitly acknowledge
  them before continuing.
- **BLOCK** → stop the checkpoint. Route the fixes to the relevant lead; re-run
  this gate after fixes land.

If the diff clearly touches none of the sensitive surfaces, note "security gate:
not applicable" in the final report and continue.

## 4. Confirm Strategy with User

Render the Git Strategy Report inline. Use `AskUserQuestion`:
- `[A] Approve strategy and proceed (Recommended)`
- `[B] Modify branch name`
- `[C] Modify commit message(s)`
- `[D] Cancel — I'll handle git manually`

If B or C, take user input and loop back to Step 2 with refined inputs.

## 5. Execute Approved Strategy

`Task(git-lead)`: "Execute the approved strategy. For each commit in the plan: (1) `git add <files>`, (2) `git commit -m '<message>'`. Create branch first if branching is needed. Show each command before running. STOP after commits unless --push was approved."

If `--push` was approved:

`Task(git-lead)`: "Run `git push -u origin <branch>`. If on a feature branch, open a PR: `gh pr create --title '<title>' --body '<body>'`. Show the PR body inline before opening."

## 6. (Conditional) Release Flow

If `--release` flag or git-lead recommended a release:

`Task(changelog-writer)`: "Read `git log <last-tag>..HEAD --oneline` and session-log entries since the last release. Produce release notes: Features / Fixes / Chores / Docs. Output inline — do not write to disk yet."

Render proposed release notes. Ask: "May I write this to `CHANGELOG.md` and apply tag `v<X.Y.Z>`?" Proceed only with approval.

`Task(git-lead)`: "Apply tag: `git tag -a v<X.Y.Z> -m '<release summary>'`. Push tag: `git push origin v<X.Y.Z>`."

## 7. Notify doc-keeper

`Task(doc-keeper)`: "Log this git checkpoint in session-log.md: branch used/created, commit(s) made (message + files), push status, PR URL if any, tag if any."

## 8. Final Report

```
=== Git Checkpoint Complete ===
Security gate: [PASS / CONCERNS (acknowledged) / not applicable]
Branch: <branch>
Commits: <N> ([list of short messages])
Push: [YES/NO] → <remote/branch>
PR: [URL or N/A]
Tag: [vX.Y.Z or N/A]
Logged: directives/session-log.md
```

## Patterns Used

This skill implements the **Git Checkpoint** pattern (Pattern 7). See `.claude/docs/agent-coordination-map.md`.
