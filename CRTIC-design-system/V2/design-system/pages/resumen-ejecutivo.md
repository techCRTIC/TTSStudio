# Page spec — Resumen Ejecutivo (re-skin to "CRTIC clean")

> Re-skin of the existing executive dashboard from the dark command-center theme
> (bg `#0A0E14`, green accent `#22C55E`) to **CRTIC clean** (Apple-sober, snow
> white, ONE orange accent). Register: **product** (design serves the task —
> earned familiarity, density is allowed, Restrained color is the floor).
> Token contract: `DESIGN.md` + `design-system/tokens/`. Chrome decision:
> **ALL-LIGHT** (sidebar + header on snow/card, hairlines — no dark scrim).

## 1. North star
The tool disappears into the task. Calm snow canvas, soft-black type, hairline
structure, and a single incandescent orange reserved for *one* thing per view.
Density is fine (it's a dashboard) but it must read as ordered, not loud. We are
NOT theming "because dashboards look cool dark" — a manager glances at project
health on a bright office monitor, so light is correct.

## 2. Surface & elevation strategy
| Layer | Token | Value | Use |
|---|---|---|---|
| App canvas | `--surface` | snow `#F5F5F7` | page background, chrome background |
| Card / panel | `--surface-card` | `#FCFCFD` | chart cards, KPI cards, table container |
| Border | `--border` | hairline `#D2D2D7` | **full borders only — never side-stripe** |
| Text | `--text` | ink `#1D1D1F` | all primary type, never `#000` |
| Muted text | `--text-muted` | ink-2 `#6E6E73` | labels, captions (large/medium only) |
| Accent | `--accent` | orange `#FA4515` | the ONE highlight (see §4) |

Rules:
- **Hairline first, shadow second.** Dense surfaces (table rows, sidebar items,
  KPI strip) separate with 1px hairlines + whitespace, NOT shadow. Reserve the
  `--crtic-shadow-card` token for the handful of floating chart cards that sit on
  snow. No shadow on rows, dots, badges, nav items.
- **Single card layer. Nested cards are always wrong.** The old dark theme nested
  cards-on-dark; on light, group with hairlines + whitespace inside one card.
- **No glassmorphism, no gradients, no side-stripe accents.**

## 3. Typography (product scale — fixed, not the brand clamp)
One family: **Geist Sans** for everything; **Geist Mono** for eyebrows, IDs,
numeric/tabular data. Do NOT use the `.display` clamp here — that's for landing.
Fixed rem scale, ratio ~1.2:

| Role | Size / weight | Notes |
|---|---|---|
| Page title | `1.25rem` / 600 | "Resumen Ejecutivo" |
| KPI number | `1.75rem` / 600, tabular | ink, not orange |
| Card heading | `0.9375rem` / 600 | section titles |
| Eyebrow / label | Mono `0.6875–0.75rem`, uppercase, tracking `0.1em`, ink-2 | the `.eyebrow` treatment |
| Body / cell | `0.8125–0.875rem` / 400 | tables can run dense (120ch+ ok) |

Hierarchy from scale + weight, never color.

## 4. The single orange accent (≤10% of the view)
Orange is precious. Its homes, in priority order:
1. **Active nav item** in the sidebar (text + subtle `rgba(250,69,21,0.08)` pill).
2. **Focus ring** (`--focus`, already orange in base.css).
3. The **Gantt "today" line** — the natural data-accent moment.
4. The **brand "C" logo mark** (brand identity is permitted).

NOT orange: KPI numbers, the avatar, status dots, chart fills, generic links.
If two things compete for orange in one view, one of them is wrong.

## 5. Status / risk data colors on light (scoped data-viz)
These are a **separate semantic-status scale** from the brand accent — legitimate
in product UI ("state-rich semantic vocabulary"). Render them as **small dots,
ticks, or badge text — never large fills**, and darken for contrast on snow.
Critically, keep them **distinct from brand orange** (`#FA4515`).

| Estado | Old (dark) | New (on snow) | Form |
|---|---|---|---|
| oportunidad | `#e0e0e0` | `#8E8E93` neutral grey | dot |
| iniciado | `#2d7ff9` | `#2563EB` blue | dot |
| en_curso | `#22c55e` | `#16A34A` green | dot |
| atencion | `#eab308` | `#CA8A04` amber | dot |
| problema | `#f97316` | `#C2410C` **rust** (NOT brand orange) | dot |
| critico | `#ef4444` | `#DC2626` red | dot |
| pausado | `#111827` | `#6E6E73` ink-2 grey | dot |
| finalizado | `#16a34a` | `#15803D` deep green | dot |

**Risk semaforo** (derived, see `lib/derive.ts`): rojo `#DC2626` · naranja
`#C2410C` (rust, not brand) · amarillo `#CA8A04` · pausado `#6E6E73` · verde
`#16A34A`. Badges = colored text + `rgba(color, 0.10)` tint pill + hairline; no
solid loud fills.

## 6. Charts on light
- **Donuts** (Por Categoria, Semaforo): segments in the muted data palette above;
  track ring = hairline `#E6E8EC`; center label ink; legend mono labels ink-2.
- **H-bar (Por Responsable):** bars in one muted ink/grey at ~`#C7C7CC` with the
  leading value in ink; baseline + ticks hairline. Avoid rainbow bars.
- **Gantt (90 días):** task bars tinted by risk at low saturation (~12–16% tint
  fill + solid hairline-weight edge in the risk color); grid lines hairline;
  **the "today" vertical line is the one orange accent.** Weekend shading = a
  hair darker snow.

## 7. Mock badge ("datos demo")
Neutral, quiet: ink-2 text, mono, `rgba(110,110,115,0.10)` pill, hairline border.
Never orange (it's not a highlight, it's a caveat).

## 8. Motion
Product motion: 150–250ms, state-only. Keep `active:scale(0.97)` press feedback.
No page-load `.rise` orchestration on the dashboard (users load into a task).
Respect `prefers-reduced-motion` (base.css already does).

## 9. Per-file migration checklist
All components currently hardcode dark hexes inline (`style={{}}`). Replace with
the semantic tokens / kit Tailwind utilities (`bg-snow`, `text-ink`,
`border-hairline`, `text-orange`) so the NEXT re-skin is a `semantic.css` remap.
- `app/globals.css` — import kit tokens (primitives→semantic→theme) + base.css; drop the old dark block; point `--crtic-font-*` at the next/font Geist vars.
- `components/dashboard/app-shell.tsx` — chrome dark→light; active nav = orange; logo "C" = orange; avatar = ink/grey.
- `kpi-card.tsx` · `data-table.tsx` · `donut.tsx` · `gantt-timeline.tsx` · `h-bar-chart.tsx` · `list-card.tsx` · `risk-dot.tsx` · `status-badge.tsx` · `mock-badge.tsx` — per §2–§7.
- `app/(dashboard)/page.tsx` / `layout.tsx` — snow canvas, spacing rhythm.

## 9-bis. Layout v2 — single-screen, table-protagonist (2026-06-19)
Supersedes the tall scrolling-document layout. The view now fits one viewport
(no full-page scroll); long regions scroll INTERNALLY. User decisions: 7-column
table (recommended set), compact-grid feel, right rail kept minimal (it felt
cramped before), detail on row-click via a right drawer. Root problems being
fixed: inconsistent spacing + an unbounded main table.

**Structure (top to bottom, viewport-height):**
1. **KPI strip** (sticky, compact): Total + per-categoria. Tighter padding than v1.
2. **Main split** filling remaining height (`min-h-0` + internal scroll):
   - **Left ~70% — Iniciativas (protagonist):** card with a slim toolbar (title +
     `N registros`), then the 7-col table. **Header sticky; body scrolls
     vertically inside a bounded height** (parent is `flex-1 min-h-0`, body
     `overflow-y-auto`). Row hover + selected state (hairline tint, never loud).
     Row click selects + opens the drawer.
   - **Right ~30% — rail, exactly two widgets:** Semaforo de Riesgo (donut +
     score) on top; a compact "Atencion" list (criticas + proximos hitos) below
     with its own internal scroll. Generous spacing — the rail must read calm.
3. **"Resumen visual" toggle** in the page header swaps the main area for the
   heavier charts (Gantt 90d, Por Categoria, Por Responsable, presupuestos mock,
   actividad mock). Default view is "Iniciativas". Keeps everything one-page.

**Table columns (the recommended 7):**
1. **Riesgo** — `RiskDot` (derived semaforo).
2. **Iniciativa** — Nombre (ink, 600) + `ID · Categoria` subtitle (mono, ink-2).
3. **Area** — text (ink-2).
4. **Responsable** — text; "Sin asignar" in rust when empty.
5. **Etapa** — mini progress (etapa_indice/etapa_total) + short etapa label.
6. **Estado** — `StatusBadge`.
7. **Proximo hito** — short text + fecha (color cue if overdue / <=7d via riesgo).

Density: rows ~40-44px, hairline separators, mono tabular for numbers/dates.
Empty/loading: skeleton rows (not spinners). The table is the one place density
is welcome; keep it ordered, not loud.

## 9-ter. Detail drawer (`project-drawer.tsx`)
Right-side drawer (NOT a modal — product register bans modal-first). Opens on row
click, closes on Esc / backdrop click / close button. Width ~420px, snow/card
surface, hairline left border, `--crtic-shadow-hero`. Backdrop = ink at ~35-40%.
Motion: slide-in 200-250ms ease-quart; respect reduced-motion (fade only).
Focus moves into the drawer on open; Esc returns it. `role="dialog"`,
`aria-label`.

Content (all real fields, no horizontal load):
- **Header:** Nombre (h3), `ID · Categoria` (mono), Estado badge + Riesgo dot.
- **Etapa stepper:** the full stage list for the project's categoria, current one
  highlighted (orange is allowed here as the single highlight, OR ink-filled —
  keep one accent in the drawer total).
- **Meta grid:** Area · Responsable · Fecha inicio -> termino · Proximo hito +
  Fecha hito · Presupuesto (ppto_aprox_texto, with parsed value if present).
- **Observaciones:** full text, 65-75ch, ink.
- **Action:** "Abrir carpeta en Drive" (link_drive) as `.crtic-btn--ghost`, or
  primary orange if it's the only CTA. Hidden if no link.

## 10. Acceptance
- `npm run build` + `npm run lint` clean, TS strict.
- No `#0A0E14` / `#22C55E` / dark-chrome hexes remain in `components/` or `app/`.
- Exactly one orange highlight reads per view; no second accent.
- All text ≥ WCAG AA on its surface (ink-2 only at ≥14px/medium).
- No side-stripe borders, no gradient text, no nested cards, no em dashes.
