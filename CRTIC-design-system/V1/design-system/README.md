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
├── css/base.css       # base layer, reduced-motion, focus ring, Lenis, .display/.eyebrow/.rise, .crtic-btn
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

## Conventions
- **Tokens > hardcoded values.** Reference semantic tokens (`--accent`, `--text`), not raw hexes.
- **Re-skin** = remap `tokens/semantic.css` only.
- **Category/portfolio colors are NOT here** — they're project data-viz, scoped to the CRTIC site.
- Live demo: `examples/playground/` (`npm i && npm run dev`).
