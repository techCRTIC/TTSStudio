# Agent Architecture Design Principles

> The encoded wisdom behind multi-agent orchestration in CCGS-style projects.
> The `/build-agent-architecture` skill reads this file in Phase 0 to seed
> Claude with the rationale behind every decision the skill asks you to make.

---

## The 8 Core Insights

### 1. Tiered hierarchy mirrors real organizational structure

A multi-agent system that lacks tiers collapses into a flat broadcast: every
agent sees every decision, no agent owns any decision, and conflicts have no
arbiter. Three tiers solve this:

- **Leadership** — strategy, vision, conflict arbitration. Few agents (2–4).
- **Department leads** — domain ownership, internal architecture. ~6–10 agents.
- **Specialists** — execution within a single discipline. The bulk (~20–40).

Skipping tiers (specialist → leadership without going through a lead)
generates either bottlenecks or shadow decisions. Forbid it.

### 2. Skills are verbs; agents are nouns; hooks are glue

- A **skill** is *what to do* — it sequences agents and produces artifacts.
- An **agent** is *who does it* — it has a domain, a persona, and tools.
- A **hook** is *when something happens automatically* — deterministic shell
  scripts that bridge the LLM and the OS.

Confusing these roles produces bloat: agents that try to be skills become
sprawling; skills that try to be agents lose composability; hooks that try
to be skills become unmaintainable.

### 3. The file is the memory; the conversation is ephemeral

LLM context windows are finite, compactable, and lossy. Filesystems are
durable. Therefore: **all state worth recovering must live in files**, not
in the conversation.

This means:
- After every milestone, write to disk (`production/session-state/active.md`).
- A `SessionStart` hook reads that file at every session start and injects
  a preview into the LLM's context.
- A `PreCompact` hook dumps full state before the LLM compacts the conversation.
- The LLM never trusts conversation memory for cross-session continuity.

This is the *single most important* invariant. Without it, the system
cannot survive a `/clear` or a crashed session.

### 4. Delegation is unidirectional and explicit

Every delegation edge is documented in a "who can delegate to whom" matrix.
Specialists never delegate up. Cross-domain edges require an explicit
escalation path (specialist → lead → leadership).

This produces:
- A tractable lattice that can be rendered as Mermaid and audited.
- Predictable conflict resolution (escalation paths are pre-baked, not
  negotiated at conflict time).
- A guardrail against rogue agents inventing their own coordination.

### 5. Models are calibrated to cognitive cost

| Model  | When                                                  | Why |
|--------|-------------------------------------------------------|-----|
| Opus   | Synthesis of 5+ documents; high-stakes verdicts       | Synthesis quality is non-linear in model strength |
| Sonnet | Single-system implementation; routine design judgment | The workhorse — strong reasoning at moderate cost |
| Haiku  | Read-and-format; status checks; deterministic formatting | No creative judgment needed — fast and cheap |

A leadership agent on Haiku will fail to arbitrate. A `/changelog` skill
on Opus is profligate. The calibration is part of the design, not an
afterthought. **Phase 8 of the skill audits this explicitly.**

### 6. The collaborative protocol prevents runaway agents

Every agent that can write to disk MUST follow:

```
Question → Options → Decision → Draft → Approval
```

In practice: the agent never writes a file without first stating
"May I write this to [filepath]?" and waiting for approval. Drafts are
shown inline; the user holds final authority.

This sounds slow. It isn't, because:
- Approvals are usually one-keystroke acknowledgments.
- The cost of an unwanted file write (lost work, polluted state) far
  exceeds the cost of a confirmation prompt.
- Without it, agents drift: they invent files, restructure directories,
  rename things — and the user discovers the damage hours later.

### 7. Memory is per-agent, scoped to domain

Each agent has its own memory directory — at the PROJECT ROOT, not inside
`.claude/`: memories are project content, and `.claude/` must stay a portable,
project-agnostic harness (migrating it must never drag another project's
memories along):

```
memory/
  MEMORY.md            <- project-level memory index (SessionStart-injected)
  <fact-slug>.md       <- one fact per file
  agents/
    art-director/
      MEMORY.md
      project_la_cuota.md
    lead-programmer/
      MEMORY.md
      ...
```

This prevents context pollution. The art-director recalling a code review
decision would destabilize its judgment; the lead-programmer recalling a
color palette debate would dilute its focus.

Per-agent memory also enables independent evolution: an agent can learn
from past projects without forcing every other agent to re-read the
same memories.

### 8. Hooks are deterministic glue around non-deterministic LLMs

LLMs are creative but unpredictable. Hooks are predictable but uncreative.
They complement each other:

- **SessionStart** — guaranteed state injection
- **PreToolUse** — guaranteed validation before destructive ops
- **PreCompact** — guaranteed state dump before lossy compression
- **SubagentStart/Stop** — guaranteed audit trail
- **PostToolUse** — guaranteed post-write validation

Without hooks, the LLM might forget to recover state, validate input, or
log a delegation. With hooks, those invariants hold even when the LLM is
wrong about what to do.

---

## Tier Philosophy

A tier is a contract:

1. **Cognitive scope** — what the tier reasons about
2. **Authority scope** — what the tier can decide unilaterally
3. **File ownership** — what directories the tier writes to
4. **Default model** — what model the tier runs on

Default 3-tier shape:

| Tier        | Cognitive scope       | Authority scope       | File ownership            | Model  |
|-------------|----------------------|----------------------|---------------------------|--------|
| Leadership  | Cross-domain, strategic | Vision, scope, arbitration | Top-level docs, ADRs   | Opus   |
| Lead        | Single domain, architectural | Domain architecture, standards | Domain root + standards | Sonnet |
| Specialist  | Single subsystem, tactical | Implementation choices within standards | Subsystem files | Sonnet/Haiku |

Adding a 4th tier ("principals" between leadership and leads) is justified
only when:
- The domain count exceeds ~12 (leadership cannot effectively arbitrate
  across that many leads)
- The project spans multiple major releases with cross-cutting technical
  themes that need their own arbiter

Below ~6 domains, a 2-tier flat structure (leadership + specialists, no
leads) is often sufficient. The skill defaults to 3 because that's the
sweet spot for most projects.

---

## Model-Routing Heuristic

Use this table when assigning a model to an agent or skill:

| Cognitive load               | Examples                                          | Model  |
|------------------------------|---------------------------------------------------|--------|
| Read & format                | Status dashboards, changelogs, file listings      | Haiku  |
| Single-doc reasoning         | Bug reports, test cases, code review of 1 file    | Haiku/Sonnet |
| Routine implementation       | Adding a feature, fixing a bug, writing a system  | Sonnet |
| Multi-doc design             | Designing a single system from 3-5 inputs         | Sonnet |
| Cross-domain synthesis       | Reviewing 5+ GDDs for consistency; architecture   | Opus   |
| High-stakes verdict          | Phase gate "go/no-go"; release sign-off           | Opus   |
| Real-time creative authoring | Brainstorming, ideation                           | Sonnet |

**Rule of thumb**: if removing the agent would not change the project's
trajectory, it's a Haiku-tier agent. If wrong judgment from the agent
would burn weeks, it's an Opus-tier agent. Everything else is Sonnet.

---

## Lattice Rules

Every delegation lattice must satisfy:

1. **Single ownership** — every domain has exactly one owner. Zero owners
   leaves the domain orphaned; two owners produces conflict.
2. **Reachability** — every specialist must trace upward to a leadership
   agent in ≤ 2 hops.
3. **Explicit cross-domain edges** — if agent A in domain X delegates to
   agent B in domain Y, both X's and Y's leads must explicitly authorize
   that edge.
4. **No upward delegation** — specialists cannot delegate to leads;
   leads cannot delegate to leadership. Delegation flows down only.
5. **Escalation, not delegation, flows up** — when blocked, an agent
   escalates (asks for direction) rather than delegates (assigns work).
6. **Bounded fan-out** — a single lead should not have more than ~6
   direct specialists. Beyond that, introduce sub-leads or split the domain.

---

## Anti-Patterns Catalog

The skill's Phase 8 audits for these. Avoid them.

### A1. The omniscient agent
A single agent owning multiple domains. Symptoms: the agent is invoked
for everything; its description is a paragraph long; it has access to
every tool. **Fix**: split it by domain.

### A2. The shadow committee
Decisions made via informal multi-agent consensus without an arbiter.
Symptoms: outcomes contradict written architecture; the same question is
re-asked weekly. **Fix**: assign a single owner with clear authority.

### A3. The bypassed lead
Specialists delegating to each other directly without going through their
lead. Symptoms: leads are surprised by changes in their domain; standards
drift across specialists. **Fix**: enforce delegation lattice; reject
specialist→specialist edges in Phase 4.

### A4. The model inversion
A leaf specialist running on Opus while a leadership agent runs on Haiku.
Symptoms: high cost with low strategic value; bottlenecked judgment at
the top. **Fix**: re-run model calibration (insight #5).

### A5. The amnesiac architecture
No state file, no SessionStart hook, no PreCompact dump. Symptoms: every
session starts with "what were we doing?"; compactions destroy progress.
**Fix**: install state recovery hooks before scaling agent count.

### A6. The toolbox-of-everything
An agent with `allowed-tools: *` or no boundary on file ownership.
Symptoms: agent edits files outside its domain; no audit possible.
**Fix**: declare explicit `allowed-tools` and ownership glob per agent.

### A7. The runaway writer
An agent that writes files without confirmation. Symptoms: files appear
that the user did not approve; directories are restructured silently.
**Fix**: enforce collaborative protocol (insight #6) in every agent
template.

### A8. The orphan workflow
A skill that invokes agents not in the roster, or workflow patterns that
cross domains without lattice edges. Symptoms: skill execution fails
mid-flow because the named agent doesn't exist; cross-domain handoffs
produce contradictory outputs. **Fix**: validate skill-to-agent
references in Phase 8.

### A9. The brittle hook
A hook that hard-codes paths or assumes a specific OS shell. Symptoms:
the architecture works on the original machine but fails when copied
elsewhere. **Fix**: parametrize hooks via `{{PROJECT_NAME}}` and use
portable bash idioms (no Windows-only or macOS-only constructs).

---

## Hook Patterns Rationale

| Hook event       | Purpose                                       | Required? |
|------------------|-----------------------------------------------|-----------|
| `SessionStart`   | Inject state preview from `active.md`         | YES       |
| `PreCompact`     | Dump full state before lossy compression      | YES       |
| `PostCompact`    | Re-read state file after compaction completes | YES       |
| `SubagentStart`  | Append to delegation audit log                | YES       |
| `SubagentStop`   | Close the audit entry                         | YES       |
| `PreToolUse`     | Validate Bash commands; reject destructive    | RECOMMENDED |
| `PostToolUse`    | Validate written files (e.g., asset naming)   | OPTIONAL  |
| `Stop`           | Final cleanup, optional summary               | OPTIONAL  |
| `Notification`   | Custom notification routing                   | OPTIONAL  |

The five "YES" hooks are the minimum for state survival. The rest are
domain-dependent.

---

## Collaborative Protocol Rationale

The protocol exists because the gap between "what the user said" and "what
the user meant" is wide. An agent that writes immediately on the LLM's
first interpretation produces:

- Files the user didn't want
- Restructured directories the user didn't approve
- Decisions the user wanted to discuss first

An agent that asks first produces:
- Slightly slower first-iteration time
- Far fewer revert/cleanup cycles
- A user who trusts the agent and gives it more autonomy over time

The protocol is asymmetric: the user can always accelerate by saying
"just do it"; the agent can never accelerate by skipping confirmation.
This is correct.

---

## Version History

| Version | Date       | Changes                                        |
|---------|------------|------------------------------------------------|
| 1.0.1   | 2026-06-10 | Insight #7: memory moved out of `.claude/` to  |
|         |            | project-root `memory/` (harness portability).  |
| 1.0.0   | 2026-05-04 | Initial release. 8 insights, 9 anti-patterns,  |
|         |            | tier philosophy, model-routing heuristic,      |
|         |            | lattice rules, hook patterns rationale.        |
