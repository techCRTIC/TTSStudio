---
name: CRTIC clean
description: Apple-sober design system — snow white, soft black, one orange accent.
colors:
  snow-white: "#F5F5F7"
  card: "#FCFCFD"
  soft-black: "#1D1D1F"
  ink-2: "#6E6E73"
  hairline: "#D2D2D7"
  crtic-orange: "#FA4515"
typography:
  display:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 6.5vw, 5.25rem)"
    fontWeight: 600
    lineHeight: 0.98
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  eyebrow:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1
rounded:
  sm: "4px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "2.5rem"
  xl: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.crtic-orange}"
    textColor: "#FFFFFF"
    rounded: "{rounded.full}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "{colors.snow-white}"
    textColor: "{colors.soft-black}"
    rounded: "{rounded.full}"
    padding: "12px 24px"
---

# Design System: CRTIC clean

## 1. Overview
CRTIC clean is an Apple-sober visual system: a snow-white canvas, soft-black type, and a single
incandescent orange used sparingly. It is calm, confident, and content-first — built to feel
premium without decoration. Typeface is Geist (Sans + Mono). Motion is restrained and motivated.
This document is the token contract; the runnable tokens live in `design-system/tokens/` and the
narrative principles in `directives/design/principles.md`.

## 2. Colors
- **Snow white `#F5F5F7`** — the primary surface. Cards step to `#FCFCFD` (never pure `#FFFFFF`).
- **Soft black `#1D1D1F`** — all type and the logo. Never `#000`.
- **Ink-2 `#6E6E73`** — secondary text (large text only on snow; fails contrast at small sizes).
- **Hairline `#D2D2D7`** — borders and rules.
- **CRTIC orange `#FA4515`** (hover `#E23C0F`) — the ONLY accent. CTA, hover, focus ring, and at
  most one highlight per view. Everything else is monochrome.
- **Scrim `#0C0C0E`** — dark stage behind full-bleed media (real footage keeps its native look).
Forbidden: AI-purple, neon, gradient text, rainbow accents, the 11 portfolio category colors
(those are data-viz, scoped to the portfolio only — not part of this system).

## 3. Typography
Geist Variable (sans) + Geist Mono Variable (mono), self-hosted via `@fontsource-variable/geist`.
- **Display**: `clamp(2.5rem, 6.5vw, 5.25rem)`, weight 600, tracking `-0.03em`, line-height `0.98`,
  `text-wrap: balance` (the `.display` class).
- **Body**: `1rem`/`1.125rem`, weight 400, line-height `1.6`, max line length 65–75ch.
- **Eyebrow**: Mono, `0.75rem`, uppercase, tracking `0.14em`, color ink-2 (the `.eyebrow` class).
Hierarchy comes from scale + weight, not color. No serif, no Inter/Outfit/DM Sans.

## 4. Elevation
Mostly flat. Two shadow tokens only:
- **card**: `0 1px 2px rgba(0,0,0,0.04), 0 12px 40px -12px rgba(0,0,0,0.18)`
- **hero**: `0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(0,0,0,0.22)`
No glassmorphism as default. Borders are 1px hairline, full (never side-stripe accents).

## 5. Components
- **Button** (`.crtic-btn`): pill (`rounded-full`), padding `12px 24px`, `scale(0.97)` on press,
  `200ms` transitions. `--primary` = orange fill, white text; `--ghost` = transparent, hairline
  border, ink text, hover border→ink.
- **Eyebrow**: the mono kicker above headings.
- **Reveal**: IntersectionObserver opacity+translateY entrance (`0.7s` ease-expo); reduced-motion
  shows immediately.
- **ConnectiveLine**: an orange SVG line that draws into a ring (brand motif), `open`/`close`.
- **Section**: snow or inverse tone, centered max-width `1400px` container, fluid block padding.
- **`.rise`**: CSS-only above-the-fold entrance (no JS gate, good for LCP).

## 6. Do's and Don'ts
**Do:** keep one accent; lean on negative space; animate transform/opacity only; use custom
easings (expo/quart); stagger 30–80ms; ship reduced-motion + keyboard fallbacks; show real work.
**Don't:** use em dashes, gradient text, glassmorphism-by-default, three-equal-card grids,
hero-metric templates, scroll cues, section-number eyebrows, `#000`/`#fff`, or a second accent.
Motion durations: press 100–160ms · dropdown 150–250ms · modal 200–500ms · reveal 500–800ms;
UI interactions stay under 300ms; no bounce/elastic.
