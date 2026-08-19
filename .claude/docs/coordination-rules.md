# Agent Coordination Rules — Personal AI Dev Studio

1. **Vertical Delegation**: Leadership agents delegate to leads, who delegate to specialists. Never skip a tier for complex decisions.
2. **Horizontal Consultation**: Agents at the same tier may consult each other but must not make binding decisions outside their domain.
3. **Conflict Resolution**: When two agents disagree, escalate to the shared parent. If no shared parent, escalate to the relevant leadership agent for the conflict's domain.
4. **Change Propagation**: When a change affects multiple domains, a leadership agent (or designated coordinator, usually `producer`) coordinates the propagation.
5. **No Unilateral Cross-Domain Changes**: An agent must never modify files outside its designated directories without explicit delegation.
6. **Brainstorm when indecisive**: When the user shows hesitation or asks open questions, leads and leadership switch to brainstorm mode — propose 2-3 options with tradeoffs and a recommendation, instead of waiting for a fully formed request.

## Model Tier Assignment

Skills and agents are assigned to model tiers based on task complexity:

| Tier | Model alias | When to use |
|------|-------------|-------------|
| Haiku | `haiku` | Read-only status checks, formatting, simple lookups |
| Sonnet | `sonnet` | Implementation, design authoring, individual system analysis |
| Opus | `opus` | Multi-document synthesis, high-stakes gate verdicts |

Always use the aliases in agent/skill frontmatter — they track the latest model per tier. Pinned model IDs go stale (see `agent-roster.md` for the current resolution).

See `agent-architecture-design-principles.md` § "Model-Routing Heuristic" for guidance on model assignment.

## Subagents vs Agent Teams

This project uses two distinct multi-agent patterns:

### Subagents (default, always active)

Spawned via `Task` within a single Claude Code session. Used by all `team-*` skills and orchestration skills. Subagents share the session's permission context and return results to the parent.

**When to spawn in parallel**: If two subagents' inputs are independent, spawn both Task calls simultaneously rather than waiting.

### Agent Teams (experimental — opt-in)

Multiple independent Claude Code *sessions* running simultaneously, coordinated via a shared task list. Each session has its own context window and token budget. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

**Use agent teams when**:
- Work spans multiple subsystems that will not touch the same files
- Each workstream would take >30 minutes and benefits from true parallelism

**Do not use agent teams when**:
- One session's output is required as input for another (use sequential subagents)
- The task fits in a single session's context

## Parallel Task Protocol

When an orchestration skill spawns multiple independent agents:

1. Issue all independent Task calls before waiting for any result
2. Collect all results before proceeding to dependent phases
3. If any agent is BLOCKED, surface it immediately — do not silently skip
4. Always produce a partial report if some agents complete and others block

## Self-Anneal Protocol (extends Layer 2 of CLAUDE.md)

When an agent or skill produces a wrong/broken output:

1. **Diagnose** — read error/output, identify root cause (do not patch symptoms)
2. **Fix the tool** — edit the agent definition, skill, or hook (not the consumer)
3. **Test the fix** — dry-run the tool against the failure case
4. **Update the directive** — entry in session-log + ADR if structural
5. **Notify** — `doc-keeper` ensures the learning is captured for future sessions

This applies recursively: if the fix reveals an architecture flaw, escalate to `technical-director` and trigger an ADR.
