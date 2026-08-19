# Global Skills Map — Personal AI Dev Studio

> The user's globally installed skills are **first-class citizens of the studio**.
> They are part of the user's workflow; agents and the orchestrator must know
> they exist and route to them. This map is the registry. `skill-curator` owns
> keeping it in sync with what is actually installed (`/start` lists them).
>
> **How subagents use skills:** subagents generally do NOT have the Skill tool.
> The orchestrator (main loop) invokes the skill and **injects the distilled
> guidance into the Task/workflow prompt**. If a specialist receives UI work
> without design guidance in its prompt, it must flag that as a protocol gap.

## 1. Design & Frontend — THE MANDATORY SUITE

**Rule: any task that touches UI, UX, visual design, or frontend look-and-feel
MUST engage the core suite before/while implementing. This is not optional.**
Skipping it is a protocol violation equivalent to skipping qa-tester.

| Skill | Role | When |
|-------|------|------|
| `impeccable` | UX/UI quality bar: hierarchy, a11y, motion, anti-patterns | ALWAYS on UI design/redesign/review |
| `ui-ux-pro-max` | Styles, palettes, font pairings, UX guidelines per stack | ALWAYS on UI build/plan |
| `emil-design-eng` | Polish philosophy: component feel, animation decisions, invisible details | ALWAYS on UI implementation |
| `design-taste-frontend` | Anti-slop direction for landings/portfolios/redesigns | ALWAYS on landing/marketing/portfolio work |

**Derivatives / reinforcement (pick per task):**
- `design-taste-frontend-v1` — only for exact backward compatibility
- `gpt-taste` — editorial layouts + strict GSAP scroll motion
- `high-end-visual-design` — premium agency defaults (fonts, shadows, spacing)
- `frontend-design` — distinctive visual direction; forces one justifiable aesthetic risk.
  ⚠️ Also a **dependency of `banner-design`**, so it ships whether or not it is picked directly
- `apple-design` — gesture-driven UI, springs, translucent materials, optical typography.
  Treat as a **foundations** skill, not a style preset: it also carries reduced-motion and
  interruptible-transition doctrine
- `minimalist-ui` / `industrial-brutalist-ui` — specific aesthetic systems
- `redesign-existing-projects` — audits + upgrades of existing UIs
- `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile` — when designing from/needing visual references
- `stitch-design-taste`, `ui-styling` — as applicable

**Divergence & selection:**
- `prototype` 🔒 — build several genuinely different versions of one UI piece behind a live picker.
  Reach for it when the right answer is a **choice**, not a critique
- `pick-ui-library` 🔒 — curated pick per frontend need (toasts, OTP, charts, drag-and-drop,
  virtualization). Complements `librarian`: this one is opinionated and pre-decided, `librarian`
  researches the landscape
- `extract-component` — archive a built visual component as a reusable asset

**Consumers:** `creative-director`, `design-lead`, `frontend-lead`,
`web-implementer`, `react-specialist`, `mobile-implementer` (via orchestrator injection).

### 1 bis. Harness-bundled design skills (NOT global installs)

These ship inside Claude Code, have no folder in `~/.claude/skills/`, and therefore never appear
in a "missing skill" check. They are still routing obligations:

| Skill | Rule |
|-------|------|
| `dataviz` | **MANDATORY before writing the first line of ANY chart**, in any medium. Live here: Starmatch renders match results |
| `artifact-design` | Load before authoring any published Artifact page |
| `artifact-diagramming` | Diagrams inside Artifacts |

## 2. Animation — TWO layers, and the top one is not GSAP

**Layer A — decision & critique (does this animate at all, and is it any good?):**

| Skill | When |
|-------|------|
| `animate` | Build motion from scratch, deciding in the order that determines whether it feels right |
| `review-animations` 🔒 | Critique existing motion against a high craft bar; approval is earned, not default |
| `improve-animations` | Audit a whole codebase's motion → prioritized plans for other agents |
| `find-animation-opportunities` | Read-only sweep for where motion is *missing* — and what must stay still |
| `animation-vocabulary` | Reverse glossary: a described effect → its exact term |

**Layer B — execution:** `gsap-core`, `gsap-timeline`, `gsap-scrolltrigger`, `gsap-plugins`,
`gsap-frameworks`, `gsap-react`, `gsap-utils`, `gsap-performance` — owned by `web-implementer`
(already encoded in its agent definition).

🔑 **Route to Layer A first.** GSAP answers *how* to move something; it never answers *whether*.
Skipping A is how a codebase ends up with technically correct motion nobody asked for.

🔒 **= invoke-only** (`disable-model-invocation: true` in its own frontmatter — verified per file,
2026-08-12, not assumed from the name): **`review-animations`, `prototype`, `pick-ui-library`.**
They will NOT fire on their own no matter how well the task matches, so the orchestrator must call
them explicitly. Every other skill on this page self-triggers normally.

## 3. Knowledge & Vault (Obsidian)

| Skill | Role | When |
|-------|------|------|
| `obsidian-vault` | Read/write the user's AI Brain vault | Documenting learnings, **and lightweight reads**: when the studio needs prior context/knowledge ("what do we know about X"), read the vault instead of asking the user |
| `obsidian-export` | Portable HTML export with graph | Sharing/exporting notes |
| `repo-scan` | Repo analysis → .md summary / blueprint | Understanding external repos; chains into obsidian-vault |
| `github-snapshot` | Top AI repos snapshot cross-referenced with vault | Discovery sessions |
| `convert-to-markdown` | Files/URLs → Markdown | Ingesting documents |

**Consumers:** `doc-keeper`, `librarian`, `producer`. Vault reads are allowed
without ceremony; vault WRITES follow the obsidian-vault skill's own structure rules.

## 4. Web Research & Data

The `firecrawl` suite (`firecrawl-search`, `-scrape`, `-crawl`, `-map`,
`-monitor`, `-deep-research`, `-seo-audit`, `-qa`, `-website-design-clone`, etc.).
⚠️ There is **no standalone `deep-research` skill installed** — this line used to name one; the
real one is `firecrawl-deep-research` (corrected 2026-08-12).

**Routing:** `librarian` (library/landscape research), `qa-tester`
(`firecrawl-qa` for live-site QA), `design-lead` (`firecrawl-website-design-clone`
for design-system extraction), `producer` (market/lead research flavors).
Prefer firecrawl skills over raw WebFetch/WebSearch when available.

## 5. Brand & Visual Assets

`brand`, `brandkit`, `banner-design`, `design`, `design-system`, `slides`,
`full-output-enforcement` (when exhaustive output is required).

**AI asset generation — `higgsfield-*`:** `higgsfield-generate` (images/video/3D/audio),
`higgsfield-websites`, `higgsfield-product-photoshoot`, `higgsfield-marketplace-cards`,
`higgsfield-video-explainer` (plus `-soul-id`, `-game-generation`).
🔴 **These depend on the `higgsfield` MCP server, which is NOT authorized in this project as of
2026-08-12** — the skill loads, the calls fail. Authorization is interactive (claude.ai connector
settings / `/mcp`); an agent cannot grant it and must not ask the user for tokens or callback URLs.
**Check auth before promising an asset**, otherwise the plan is built on a tool that cannot run.

**Consumers:** `creative-director`, `design-lead`, `changelog-writer` (slides for reports).

## 6. Required global skills (dependency manifest)

The studio DECLARES these globally-installed skills as dependencies — the
`package.json` pattern applied to skills. They are not copied into the project
(project-level copies would shadow the global ones and freeze them at copy
time); instead `/start` verifies them at session start and reports what's missing.

**REQUIRED** (missing one = warning in every session briefing):

```
impeccable
ui-ux-pro-max
emil-design-eng
design-taste-frontend
obsidian-vault
gsap-core
firecrawl
```

**RECOMMENDED** (flagged softly if absent):

```
gpt-taste · high-end-visual-design · redesign-existing-projects · frontend-design · apple-design
animate · review-animations · improve-animations · find-animation-opportunities
obsidian-export · repo-scan · convert-to-markdown
firecrawl-search · firecrawl-scrape · firecrawl-qa · firecrawl-website-design-clone
gsap-scrolltrigger · gsap-react · gsap-performance
design-system · brand · slides
```

⚠️ **A manifest cannot declare what the harness bundles.** `dataviz`, `artifact-design` and
`artifact-diagramming` (§ 1 bis) have no folder on disk, so a presence check can neither find them
nor miss them. They are obligations, not dependencies — do not "fix" their absence by installing
look-alikes.

## 7. Maintenance of this map

- New global skill installed → `skill-curator` adds it here and (if model-tier
  relevant) to `technical-preferences.md` § Skill Model Routing.
- `/start` step 2 enumerates available skills; if it finds skills missing from
  this map, it flags the drift to `skill-curator`.

**Last full reconciliation: 2026-08-12** (session 24), against the 83 folders in
`~/.claude/skills/`. It closed **13 design skills** that were installed and unmapped: the five
animation-decision skills, `apple-design`, `frontend-design`, `prototype`, `pick-ui-library`,
`extract-component`, and the `higgsfield-*` family.

🔴 **The drift exposed a BLIND SPOT IN THE CHECK ITSELF, and this is the reason to date this line.**
Three of the thirteen — `prototype`, `pick-ui-library`, `review-animations` — were installed **and
absent from the session's own skill listing**. The set of missing ones is **exactly** the set
carrying `disable-model-invocation: true`: an invoke-only skill is hidden from the model-visible
listing *by design*, because it must not self-trigger.

⇒ **`/start` step 2 can never see them.** Enumerating what the session offers is not the same as
enumerating what is installed, and the gap is not random — it is precisely the skills that only
work when the orchestrator names them, which is also precisely the population that needs a registry
most. **A real reconciliation reads `~/.claude/skills/` directly** (`ls -d */`, then each
`SKILL.md` frontmatter); the session listing only narrows how often that is needed.
