# Agent Roster — Personal AI Dev Studio

The following agents are available. Each has a dedicated definition file in `.claude/agents/`. When a task spans multiple domains, the coordinating agent (usually a leadership agent or a relevant lead) delegates to specialists.

## Tier 1 — Leadership Agents (Opus)

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `technical-director` | Architecture, technical sign-off, lattice arbitration | Cross-domain technical decisions, ADR sign-off, stack changes |
| `creative-director` | UX/UI vision, brand, voice, design strategy | Design direction, brand consistency, UX trade-off arbitration |
| `producer` | Planning, scope, prioritization, doc-keeping supervision | Sprint kick-off, scope arbitration, status synthesis |

## Tier 2 — Department Lead Agents (Sonnet)

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `frontend-lead` | Web frontend (framework choice, component structure) | Picking React/Next/Svelte, frontend architecture |
| `backend-lead` | API, server, auth, business logic | API design, auth strategy, server architecture |
| `mobile-lead` | iOS, Android, cross-platform | RN vs Flutter vs Expo, mobile architecture |
| `devops-lead` | Infra, CI/CD, deploys, secrets | Pipeline setup, deploy strategy, infra-as-code |
| `git-lead` | Version control strategy (commits, branches, PRs, tags) | Commit authorship, branching decisions, push/PR timing, release tagging |
| `design-lead` | Design system, components, asset pipeline | DS authoring, component library, asset workflow |
| `skill-curator` | Owns `Skills/`: regen, orchestration, new skill proposals | Detecting skill gaps, proposing regen, orchestrating multi-skill flows |
| `doc-keeper` | Owns `directives/`, `session-log.md`, `project-overview.md` | Doc maintenance, ADR tracking, session-log discipline |

## Cross-Tier Gate Agents (Opus)

| Agent | Domain | When to Use |
|-------|--------|-------------|
| `security-reviewer` | Security & data-protection gate (read-only) | Before `git-lead` commits any feature touching auth, personal data, external input, third-party APIs, or infra/secrets. Verdict: PASS / CONCERNS / BLOCK |

## Tier 3 — Specialist Agents (Sonnet or Haiku)

| Agent | Domain | Model | When to Use |
|-------|--------|-------|-------------|
| `react-specialist` | React + ecosystem (hooks, state, SSR) | Sonnet | Implementing React features, RSC, complex state |
| `web-implementer` | Vanilla web (HTML/CSS/JS, animations) | Sonnet | Static sites, animations (engages GSAP suite) |
| `node-specialist` | Node/Express/Fastify | Sonnet | Server implementation, middleware, Node tooling |
| `python-specialist` | Deterministic Python scripts (Layer 3) | Sonnet | execution/ scripts, data processing, automation |
| `db-specialist` | Schemas, queries, migrations | Sonnet | Schema design, query optimization (engages sql-queries) |
| `mobile-implementer` | RN / Expo / Flutter implementation | Sonnet | Implementing mobile features |
| `qa-tester` | Tests + verification (cross-domain shared) | Sonnet | Writing/running tests, verification before merge — invocable by any lead |
| `librarian` | Library recommendation (research + ranking) | Haiku | Picking libs for a stack: comparison + tradeoffs |
| `skill-author` | Writes/edits skills (uses `skill-creator`) | Sonnet | Authoring new skills or regenerating existing ones |
| `changelog-writer` | Changelogs, status reports, release notes | Haiku | Per-area changelogs, release summaries |

## Model Tier Assignment Reference

| Tier | Model ID | When to use |
|------|----------|-------------|
| Haiku | `haiku` (currently resolves to Haiku 4.5) | Read-only status checks, formatting, simple lookups — no creative judgment needed |
| Sonnet | `sonnet` (currently resolves to Sonnet 5) | Implementation, design authoring, analysis of individual systems — default for most work |
| Opus | `opus` (currently resolves to Opus 4.8) | Multi-document synthesis, high-stakes phase gate verdicts, cross-system holistic review |

> Agent frontmatter uses the model **aliases** (`haiku` / `sonnet` / `opus`), never pinned model IDs — aliases track the latest model in each tier automatically.

See `agent-architecture-design-principles.md` for the full model-routing heuristic.
