# CRTIC Design System — "CRTIC clean"

A portable, self-contained kit that packages the Apple-sober CRTIC essence: snow white + soft
black + one orange accent, Geist type, restrained motivated motion. Use it for any new design.

Owned by `design-lead`. Principles in [`directives/design/principles.md`](../directives/design/principles.md).
AI-skill context in [`PRODUCT.md`](../PRODUCT.md) + [`DESIGN.md`](../DESIGN.md) (repo root).

```
design-system/
├── tokens/            # 3-layer CSS vars: primitives → semantic → @theme (Tailwind v4)
│   ├── primitives.css   raw values (color/type/space/radii/shadow/motion/z)
│   ├── semantic.css     purpose aliases (--surface, --text, --accent, --border, --focus)
│   ├── theme.css        Tailwind v4 @theme drop-in (bg-snow / text-ink / font-sans …)
│   └── index.css        imports the three, in order
├── tokens.json        # JSON source of truth (DTCG-style)
├── css/base.css       # base layer, reduced-motion, focus ring, Lenis, .display/.eyebrow/.rise,
│                      #   .crtic-btn (+ --stroke), .crtic-elevated (machined/focal depth + glow)
└── react/             # framework primitives (peer deps: react; + gsap/lenis for motion)
    ├── primitives/    Button, Reveal, ConnectiveLine, Eyebrow, Section
    ├── hooks/         useReducedMotion, useSmoothScroll
    └── lib/           easings (EASE/EASE_CSS/DURATION), gsap (registered ScrollTrigger)
```

## Use it in a new project

### A) Vite + React + Tailwind v4 (full kit)
1. Install peers:
   ```
   npm i react react-dom gsap @gsap/react lenis @phosphor-icons/react \
         @fontsource-variable/geist @fontsource-variable/geist-mono
   npm i -D tailwindcss @tailwindcss/postcss
   ```
2. In your entry CSS (e.g. `src/index.css`):
   ```css
   @import "tailwindcss";
   @import "../path/to/design-system/tokens/index.css";
   @import "../path/to/design-system/css/base.css";
   ```
3. In `main.tsx`, load Geist (self-hosted, no Google Fonts link):
   ```ts
   import "@fontsource-variable/geist";
   import "@fontsource-variable/geist-mono";
   ```
4. Use the primitives:
   ```tsx
   import { Button, Eyebrow, Reveal, Section, ConnectiveLine, useSmoothScroll } from "../path/to/design-system/react";
   ```

### B) Any framework / no Tailwind (tokens only)
Import just the CSS — the tokens and `.display`/`.eyebrow`/`.rise`/`.crtic-btn` classes work
standalone:
```css
@import "../path/to/design-system/tokens/index.css";
@import "../path/to/design-system/css/base.css";
```
Then write `var(--accent)`, `var(--text)`, `class="display"`, `class="crtic-btn crtic-btn--primary"`, etc.

### C) Make AI design skills apply CRTIC
The `impeccable` skill (and friends) read `PRODUCT.md` + `DESIGN.md` from the project root. To
reuse the CRTIC essence in another repo, copy those two files there, or set
`IMPECCABLE_CONTEXT_DIR` to this repo's root.

## Signature patterns (the login DNA, made reusable)
The sign-in screen is the flagship expression of "CRTIC clean"; its energy is codified here:
- **Machined / focal depth.** `class="crtic-elevated"` = warm-tinted layered ambient shadow + inset
  top highlight; add `crtic-elevated--focal` for the single dramatic hero drop, and
  `crtic-elevated--interactive` for the hover **lift + `--glow-accent`** (an accent-colored halo that
  recolors with `--accent`). Tokens: `--elevation-machined | --elevation-focal | --glow-accent`.
- **Wave easing.** `--ease-glide` (`ease-wave`, `cubic-bezier(0.37,0,0.63,1)`) at `--dur-lift` 280ms /
  `--dur-glide` 360ms — surfaces breathe, they don't snap. Reserve `expo/quart` for reveals & quick UI.
- **Stroke button.** `class="crtic-btn crtic-btn--stroke"` — snow surface, 1.5px orange outline,
  warm-tint fill + soft orange shadow on hover (the "connect an account" button).
- **Purposeful veil.** `--surface-veil` (`rgba(252,252,253,0.55)`) — drop a panel to this *only* to
  let a live backdrop read through; always pair it with a solid twin panel. Not default glass.
- **Living data field.** An interactive Canvas 2D data-viz backdrop (hairline grid, monochrome-orange
  line/area plots, flowing data dots with a lead-dot halo, cursor spotlight, mouse parallax) — the
  product proving itself. Chart libs are banned; hand-roll in Canvas/SVG. Decorative → `aria-hidden`;
  honor `prefers-reduced-motion` (one static frame). See `DESIGN.md` §6 for the full spec.
- **Focal radius.** `--radius-focal` (`rounded-focal`, 28px) for large hero cards.

Discipline: depth, glow, and the veil are *focal tools* — at most one machined/focal surface per view,
same rule as the single orange. Everything else stays flat.

## Conventions
- **Tokens > hardcoded values.** Reference semantic tokens (`--accent`, `--text`, `--elevation-*`,
  `--glow-accent`, `--ease-glide`), not raw hexes.
- **Re-skin** = remap `tokens/semantic.css` only.
- **Category/portfolio colors are NOT here** — they're project data-viz, scoped to the CRTIC site.
- Live demo: `examples/playground/` (`npm i && npm run dev`).
