# Agent Coordination and Delegation Map — Personal AI Dev Studio

## Organizational Hierarchy

```
                       ┌──────────────────────────────────┐
                       │           LEADERSHIP             │
                       │  technical-director              │
                       │  creative-director               │
                       │  producer                        │
                       └────────────────┬─────────────────┘
                                        │
        ┌──────────────┬───────────────┼────────────────┬──────────────┐
        │              │               │                │              │
   frontend-lead  backend-lead   mobile-lead    devops-lead  git-lead   design-lead
        │              │               │                │              │
        │              │               │                │              │
        ├─ react-spec  ├─ node-spec    ├─ mobile-impl   ├─ python-spec ├─ web-impl
        ├─ web-impl    ├─ python-spec  ├─ react-spec    ├─ qa-tester   │
                       ├─ db-spec      │                │              │
                                                        │
                       ┌───────────────┴─────────────┐
                       │                             │
                  skill-curator                 doc-keeper
                       │                             │
                       ├─ skill-author              ├─ changelog-writer
                       ├─ librarian                 ├─ librarian
```

### Legend

```
─── solid line: standard delegation (intra-domain)
- - dashed line: cross-domain edge (requires both leads' authorization)

qa-tester is owned by devops-lead but is GLOBALLY invocable by any lead via Task
(shared verification specialist; see "Cross-Domain Communication Protocols").

security-reviewer sits OUTSIDE the delegation tree: a read-only, globally
invocable gate (Opus) that must pass before git-lead commits sensitive changes.
```

## Delegation Rules

### Who Can Delegate to Whom

| From | Can Delegate To |
|------|----------------|
| `technical-director` | frontend-lead, backend-lead, mobile-lead, devops-lead, git-lead, skill-curator |
| `creative-director` | design-lead, frontend-lead (cross), doc-keeper |
| `producer` | All leads |
| `frontend-lead` | react-specialist, web-implementer |
| `backend-lead` | node-specialist, python-specialist, db-specialist |
| `mobile-lead` | mobile-implementer, react-specialist (cross) |
| `devops-lead` | python-specialist (cross), qa-tester |
| `design-lead` | web-implementer (cross) |
| `skill-curator` | skill-author, librarian |
| `doc-keeper` | changelog-writer, librarian (cross) |
| `git-lead` | changelog-writer (cross, release only), qa-tester (global) |
| **Any lead** | qa-tester (global cross-edge for verification) |
| **Any lead / orchestrator** | security-reviewer (global gate — read-only; MUST run before git-lead commits any feature touching auth, PII, external input, third-party APIs, or infra/secrets) |

### Escalation Paths

| Situation | Escalate To |
|-----------|------------|
| Two specialists disagree | Their shared lead |
| Two leads disagree (e.g., frontend ↔ backend) | producer → technical-director |
| Design vs technical conflict | creative-director ↔ technical-director (producer arbitrates) |
| Skill regen breaks contract | skill-curator → technical-director |
| Stack change in active project | technical-director (sign-off required) |
| Doc drift detected (>2 sessions stale) | doc-keeper → producer |
| Library choice disputed | librarian researches → relevant lead decides → doc-keeper writes ADR |
| Branching strategy conflicts (git-lead ↔ devops-lead) | producer → technical-director |
| Semver judgment (major vs minor vs patch) | git-lead → technical-director |
| security-reviewer verdict is BLOCK and the lead disagrees | technical-director (security wins unless explicitly overridden by the user) |

## Common Workflow Patterns

### 1. New App Feature
**Trigger:** User requests a new feature for an app/site.
**Pipeline:** `producer` → `technical-director` (sign-off) → relevant `*-lead` → specialist(s) → `qa-tester` → `doc-keeper` (session-log + ADR if architectural)
**Output:** Shipped feature + ADR (if architecturally significant)

### 2. Bug Fix
**Trigger:** Bug reported.
**Pipeline:** `qa-tester` (triage) → relevant `*-lead` → specialist(s) → `qa-tester` (regression) → `doc-keeper` (changelog entry)
**Output:** Fix + regression test

### 3. Sprint Cycle
**Trigger:** Start of a sprint.
**Pipeline:** `producer` (plan) → leads execute concurrently → `producer` (retrospective) → `doc-keeper` (sprint summary in session-log)
**Output:** Sprint summary

### 4. Release Pipeline
**Trigger:** Ready to deploy.
**Pipeline:** `devops-lead` → `qa-tester` (final verification) → `changelog-writer` → deploy
**Output:** Released version + public changelog

### 5. Skill Regeneration ⭐ (custom)
**Trigger:** `skill-curator` detects a gap, or user requests regen.
**Pipeline:** `skill-curator` (gap analysis + diff proposal) → `skill-author` (edit) → `qa-tester` (validate by dry-run) → `doc-keeper` (session-log entry)
**Output:** Regenerated skill + log entry

### 6. Library Recommendation ⭐ (custom)
**Trigger:** Stack decision needed (new project or migration).
**Pipeline:** `librarian` (research + shortlist with tradeoffs) → relevant `*-lead` (decision) → `doc-keeper` (ADR)
**Output:** ADR with library choice + rationale

### 7. Git Checkpoint ⭐ (custom)
**Trigger:** `qa-tester` signs off on a feature (end of `team-new-feature`), OR manual `/team-git-checkpoint` invocation.
**Pipeline:** [`security-reviewer` gate if the change touches auth/PII/external input/third-party APIs/infra — PASS or user-acknowledged CONCERNS required] → `git-lead` (state analysis → branching decision → commit proposal) → [user approval] → `git-lead` (commit + optional push) → `changelog-writer` (if release) → `doc-keeper` (log)
**Output:** Committed changeset with Conventional Commits message. PR opened if on feature branch.

### 8. Roadmap Checkpoint ⭐ (custom)
**Trigger:** The idea+investigation phase closes — a foundational decision (an `ADR-*.md`) exists but `directives/roadmap.md` is still a skeleton. The Stop hook (`.claude/hooks/stop-state-reminder.sh`, Invariant 2) detects this via the `roadmap-checkpoint: pending` sentinel and nudges the orchestrator.
**Pipeline:** orchestrator proposes a roadmap to the user (`AskUserQuestion`: fases + alcances/scope) → on accept, `producer` drafts `directives/roadmap.md` (phases = pregunta answered · entregables · exit criteria; in/out-of-scope) → `doc-keeper` links it from `project-overview.md` and seeds genuinely-deferred items into `backlog.md`. On accept **or** decline, flip the `roadmap-checkpoint: pending` sentinel to `done`/`declined` so the hook goes quiet.
**Output:** `directives/roadmap.md` (or an explicit, recorded decline) — before build work begins.

### 9. Session Close ⭐ (custom)
**Trigger:** End of a working session — user says they're done, or `/close` is invoked manually. The mirror of **Project Onboarding** (`/start`).
**Pipeline:** orchestrator reconstructs the session from evidence (git diff/log + file mtimes + `active.md`, never from memory alone) → drafts the `<!-- cierre -->` block + full entry at the TOP of `directives/session-log.md` [user approval] → rewrites `production/session-state/active.md` **last** (its mtime must stay newest or the Stop hook blocks) → `doc-keeper` syncs project-overview / backlog / roadmap sentinel / memory → optional `/team-git-checkpoint` → `.tmp/` purge + secrets/PII pass over everything just written.
**Output:** A session-log entry whose `<!-- cierre -->` block is the next session's first context (injected verbatim by `session-start.sh`), plus a refreshed `active.md`.
**Note:** `stop-state-reminder.sh` is only a backstop — it catches a *missing* summary, never a shallow one. The skill (`team-session-close`) is what makes the close real.

## Cross-Domain Communication Protocols

### Shared verification (`qa-tester` global edge)

`qa-tester` is owned by `devops-lead` but every lead may invoke it via `Task` for:
- Pre-merge verification of a feature
- Bug-fix regression confirmation
- Skill regeneration validation
- Release pipeline final check

When invoked cross-domain, `qa-tester` must include in its report which lead requested the verification.

### Design Change Notification

When a design document changes, `design-lead` notifies `creative-director` (always) and any `*-lead` whose domain intersects the change. Notification is written to `production/session-state/active.md` under "Key Decisions Made".

### Architecture Change Notification

When an ADR is created or modified, `technical-director` notifies all leads. The ADR itself is the notification artifact; an entry in `active.md` references the ADR by path.

### Skill change notification

When `skill-curator` regenerates a skill, it notifies `doc-keeper` (always) and any agent that uses that skill (via session-log entry referencing the skill name).

### Library decision notification

When `librarian` recommends and a `*-lead` decides on a library, `doc-keeper` writes the ADR. `technical-director` is auto-notified via the ADR creation hook.

### Git strategy notification

When `git-lead` creates a branch that may trigger a CI/CD pipeline, it notifies `devops-lead` before creating. When `git-lead` opens a PR, it notifies `doc-keeper` (to log the PR URL in session-log) and `changelog-writer` (if the PR is a release).

## Anti-Patterns to Avoid

1. **Bypassing the hierarchy**: A specialist must never make decisions that belong to their lead without consultation.
2. **Cross-domain implementation**: An agent must never modify files outside its designated area without explicit delegation from the relevant owner.
3. **Shadow decisions**: All decisions must be documented (ADR for architectural; session-log for operational). Verbal agreements without written records lead to contradictions.
4. **Monolithic tasks**: Every task assigned to an agent should be completable in 1–3 days. If larger, break it down first.
5. **Assumption-based implementation**: If a spec is ambiguous, the implementer must ask the specifier rather than guessing. Wrong guesses are more expensive than a question.
6. **Skill regeneration without QA**: Never write a regenerated skill to disk without `qa-tester` dry-run validation.

See `agent-architecture-design-principles.md` for the full anti-pattern catalog.
