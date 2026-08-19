# Technical Preferences — Personal AI Dev Studio

## Stack

The studio is **stack-agnostic by design** — it adapts per project. Default preferences when starting greenfield work:

- **Web frontend**: TypeScript + React (Next.js for SSR/RSC; Vite for SPA). Svelte/SvelteKit when minimalism matters.
- **Backend**: TypeScript + Node (Fastify for new APIs; Express for legacy compat). Python (FastAPI) when ML/data is central.
- **Mobile**: React Native (Expo managed workflow) for cross-platform; native only when justified.
- **Database**: Postgres (Supabase or Neon). SQLite for local-first apps.
- **Infra**: Vercel/Netlify for static + serverless; Fly.io / Railway for containers.
- **CSS**: Tailwind for speed; CSS Modules / Vanilla Extract when isolation matters.
- **State**: TanStack Query for server state; Zustand for client. Avoid Redux for new work.

`librarian` consults this list as the starting point and proposes alternatives with tradeoffs. Final choice is the relevant lead's call (documented in an ADR).

## Python Environments

Full rule in CLAUDE.md § *Python Environment Discipline*. Summary + tooling preference:

- **Trigger (binary):** code needs a third-party dependency → project venv at `.venv/`, git-ignored, regenerable from `pyproject.toml` (preferred) or `requirements.txt`. Pure stdlib / containerized / already-active env → no venv.
- **Tooling preference: `uv`** (`uv venv`, `uv add`, `uv run`) over raw `python -m venv` + pip — it auto-creates and syncs `.venv/`, making the rule self-enforcing. `uvx` / `pipx` for standalone CLI tools.
- Always invoke the interpreter by path (`.venv/Scripts/python.exe` on Windows, `.venv/bin/python` on POSIX) — never rely on an "activated" shell surviving between Bash calls.
- Enforcement: `enforce-venv.sh` (PreToolUse) hard-blocks global pip installs.

## Naming Conventions

- Files: `kebab-case.ext` (`user-profile.tsx`, `auth-middleware.ts`)
- React components: `PascalCase` (`UserProfile`)
- Hooks: `useCamelCase` (`useAuthStatus`)
- Constants: `SCREAMING_SNAKE_CASE`
- Branches: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/` prefixes
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, etc.)

## Performance Budgets

- First Contentful Paint < 1.5s on 3G fast
- Largest Contentful Paint < 2.5s on 3G fast
- Bundle JS < 200kb gzipped per route (initial)
- API responses < 300ms p95 (internal); < 1s p95 (user-facing)

## Testing

- Unit tests for pure functions, business logic, and hooks (Vitest preferred over Jest)
- Integration tests for API routes (real DB, no mocks)
- E2E for critical user flows only (Playwright)
- `qa-tester` enforces these baselines before any merge to main

## Forbidden Patterns

- `any` in TypeScript (use `unknown` + narrowing)
- Installing Python packages into the global/system Python (blocked by `enforce-venv.sh`)
- Force-pushing to main/master (blocked by `validate-commit.sh`)
- Committing `.env*` files (blocked by `validate-commit.sh`)
- Mocking the database in integration tests
- Inline styles in React (use Tailwind / CSS Modules)
- Shipping without an ADR for architecturally significant decisions

## Allowed Libraries / Dependencies

`librarian` maintains a per-project allow-list. Current global default allow-list:
- React, Next.js, Vite, Svelte, SvelteKit
- Fastify, Express, Hono
- Prisma, Drizzle, Kysely
- TanStack Query, Zustand, Jotai
- Tailwind, Vanilla Extract, CSS Modules
- Vitest, Playwright, MSW
- Zod for runtime validation
- date-fns (NOT moment)
- GSAP for advanced animation (already as skill suite)

## Architecture Decisions Log

ADRs live at `directives/architecture/ADR-*.md`. Index maintained by `technical-director`. New ADRs follow [Michael Nygard's format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions): Context → Decision → Status → Consequences.

## Documentation Conventions

- **Mermaid for flows (ASK FIRST):** whenever writing or substantially updating a
  document that describes a **flow, pipeline, process, architecture, or state
  machine** at a generic level, **ask the user** whether they want it captured as
  a Mermaid diagram *before* writing — don't assume either way. Pick the fitting
  type (`flowchart`, `sequenceDiagram`, `stateDiagram`, `erDiagram`). Mermaid
  renders natively in GitHub-flavored Markdown and the IDE preview.
- **Diagram legibility:** when coloring nodes with `classDef`, always set an
  explicit dark `color:` (e.g. `color:#14321d`) so labels stay readable on light
  fills regardless of the reader's Mermaid theme (light/dark).

## Skill Model Routing

> **Skill→domain routing and the MANDATORY design suite live in
> [`global-skills-map.md`](global-skills-map.md).** This table only assigns model tiers.

The following skills run on the listed model tier. Routing follows the heuristic in `agent-architecture-design-principles.md` § "Model-Routing Heuristic".

| Skill | Model | Cognitive load |
|-------|-------|----------------|
| `skill-creator` | Sonnet | Multi-doc synthesis (skill schema + examples) |
| `impeccable` | Sonnet | Code review judgment |
| `emil-design-eng` | Sonnet | Design + engineering synthesis |
| `brainstorm-ideas-new`, `brainstorm-ideas-existing` | Sonnet | Creative authoring |
| `brainstorm-experiments-new`, `brainstorm-experiments-existing` | Sonnet | Experiment design reasoning |
| `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`, `gsap-frameworks`, `gsap-react`, `gsap-utils`, `gsap-performance` | Sonnet | Animation implementation |
| `gtm-motions`, `gtm-strategy` | Sonnet | GTM strategy reasoning |
| `sql-queries` | Sonnet | Query authoring |
| `obsidian-vault`, `obsidian-export` | Sonnet | Vault structure reasoning |
| `pdf` | Haiku | Read & format |
| `team-new-feature` | Sonnet | Multi-agent orchestration |
| `team-skill-regeneration` | Sonnet | Skill regen orchestration |
| `team-library-recommendation` | Sonnet | Library research orchestration |
| `team-session-start` (`/start`) | Sonnet | Multi-doc context loading |

All other skills default to Sonnet. When creating new skills, assign Haiku if the skill only reads and formats; assign Opus if it must synthesize 5+ documents with high-stakes output; otherwise leave unset (Sonnet).

## Specialist Routing

When a task requires deep expertise in a specific subsystem, delegate to the matching specialist:

| Task | Specialist |
|------|------------|
| React component, hook, or RSC | `react-specialist` |
| Static site, vanilla web, animation | `web-implementer` |
| Node API, Fastify/Express handler | `node-specialist` |
| Python script (Layer 3 / data / automation) | `python-specialist` |
| DB schema, migration, query optimization | `db-specialist` |
| RN / Expo / Flutter screen or component | `mobile-implementer` |
| Test authoring, regression check | `qa-tester` (any lead may invoke) |
| Library research / recommendation | `librarian` |
| New skill or skill regeneration | `skill-author` |
| Changelog or release notes | `changelog-writer` |
