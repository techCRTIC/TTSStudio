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
  xl: "28px"          # large focal cards (sign-in, hero panels)
  full: "9999px"
spacing:
  xs: "0.5rem"
  sm: "1rem"
  md: "1.5rem"
  lg: "2.5rem"
  xl: "4rem"
elevation:
  card: "0 1px 2px rgba(0,0,0,.04), 0 12px 40px -12px rgba(0,0,0,.18)"
  hero: "0 1px 2px rgba(0,0,0,.04), 0 24px 60px -20px rgba(0,0,0,.22)"
  focal: "0 1px 2px rgba(0,0,0,.04), 0 40px 90px -30px rgba(0,0,0,.28)"
  machined: "layered warm-tinted stack + inset 0 1px 0 rgba(255,255,255,.8)"
  glow-accent: "0 0 72px -10px color-mix(in srgb, var(--accent) 26%, transparent)"
motion:
  ease-reveal: "cubic-bezier(0.16, 1, 0.3, 1)"   # expo
  ease-ui: "cubic-bezier(0.25, 1, 0.5, 1)"       # quart
  ease-wave: "cubic-bezier(0.37, 0, 0.63, 1)"    # ease-in-out-sine, lifts/glides
  dur-lift: "280ms"
  dur-glide: "360ms"
surface:
  veil: "rgba(252,252,253,0.55)"   # purposeful veil over a live backdrop
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
  button-stroke:
    backgroundColor: "{colors.card}"
    textColor: "{colors.soft-black}"
    border: "1.5px {colors.crtic-orange}"
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
Flat by default; depth is *earned* on focal surfaces, exactly like the accent. Four tokens:
- **card**: `0 1px 2px rgba(0,0,0,0.04), 0 12px 40px -12px rgba(0,0,0,0.18)` — everyday surfaces.
- **hero**: `0 1px 2px rgba(0,0,0,0.04), 0 24px 60px -20px rgba(0,0,0,0.22)` — larger content blocks.
- **focal**: `0 1px 2px rgba(0,0,0,0.04), 0 40px 90px -30px rgba(0,0,0,0.28)` — one dramatic drop for a
  single hero card (the sign-in card floats on this).
- **machined**: a warm-tinted layered stack **plus an inset top highlight**
  (`inset 0 1px 0 rgba(255,255,255,0.8)`) — reads as precision hardware, not glass, not a hard border.
- **glow-accent**: `0 0 72px -10px color-mix(in srgb, var(--accent) 26%, transparent)` — an accent-colored
  halo on lifted/active surfaces. It's built on `--accent`, so a card recolors its glow with the active
  category. Compose on hover: `box-shadow: var(--elevation-focal), var(--glow-accent)`.

Interactive surfaces lift on hover (`translateY(-3px) scale(1.006)`) on the **wave** easing (see §6) —
a soft glide, never a snap. Borders stay 1px hairline, full (never side-stripe accents). Depth is a
focal tool: at most one machined/focal card per view, same discipline as the orange.

## 5. Components
- **Button** (`.crtic-btn`): pill (`rounded-full`), padding `12px 24px`, `scale(0.97)` on press,
  `200ms` transitions. `--primary` = orange fill, white text; `--ghost` = transparent, hairline
  border, ink text, hover border→ink; `--stroke` = card surface, `1.5px` orange outline, ink text —
  on hover fills with a `7%` warm tint, lifts `-1px`, and casts a soft orange shadow (the sign-in /
  "connect an account" button).
- **Elevated surface** (`.crtic-elevated`): a card carrying **machined** depth (`--focal` swaps to the
  single dramatic drop). Add `--interactive` for the hover lift + `glow-accent`, glided on the wave
  easing. This is the login card's language, made reusable.
- **Eyebrow**: the mono kicker above headings.
- **Reveal**: IntersectionObserver opacity+translateY entrance (`0.7s` ease-expo); reduced-motion
  shows immediately.
- **ConnectiveLine**: an orange SVG line that draws into a ring (brand motif), `open`/`close`.
- **Section**: snow or inverse tone, centered max-width `1400px` container, fluid block padding.
- **`.rise`**: CSS-only above-the-fold entrance (no JS gate, good for LCP).

## 6. Signature motion, the living data field & translucency
The **wave** easing `cubic-bezier(0.37, 0, 0.63, 1)` (ease-in-out-sine) is the house glide for lifts
and large-surface transitions: symmetric in and out, so surfaces *breathe* rather than snap. Use it
at `280ms` (lift: nav rows, buttons, small cards) and `360ms` (glide: focal cards). The snappy
`expo`/`quart` easings still own reveals and quick UI; `wave` owns hover lift and depth.

**The living data field** — the surface can carry an interactive data-viz backdrop that *is* the
product proving itself. Reference implementation: the sign-in `PlotFieldBg` (Canvas 2D, chart-libs
banned here). Its rules:
- A faint **hairline grid** (`ink-2 @ ~8%`) on snow, drifting with a slow mouse parallax.
- Several slow line+area plots on a **monochrome orange ramp** — light coral → burnt orange. This
  reads as a data-viz *scale*, not a second accent or a rainbow: still "one orange".
- **Data dots flow along each curve**, each wave at its own speed, with a lead dot carrying a soft
  halo — a live-readout feel. One faint orange **cursor spotlight**.
- Layers **parallax** to the pointer (eased, subtle). Decorative → `aria-hidden`; honors
  `prefers-reduced-motion` (renders one static frame, no pointer reactivity).

**Purposeful translucency** — a surface may drop to the **veil** (`rgba(252,252,253,0.55)`) *only* to
let a live backdrop read through it (the login's brand panel over the field). This is not the banned
glassmorphism-by-default: it's earned, scoped to animated media, always paired with a solid twin panel.

## 7. Do's and Don'ts
**Do:** keep one accent; lean on negative space; animate transform/opacity only; use custom
easings (expo/quart for reveals & quick UI, wave for lift/glide); stagger 30–80ms; reserve
machined/focal depth + accent-glow for one focal surface per view; ship reduced-motion + keyboard
fallbacks; show real work (a live data field counts).
**Don't:** use em dashes, gradient text, glassmorphism-**by-default** (a purposeful veil over live
media is fine), three-equal-card grids, hero-metric templates, scroll cues, section-number eyebrows,
`#000`/`#fff`, a second accent, or depth-everywhere (it stops being focal).
Motion durations: press 100–160ms · lift 280ms · dropdown 150–250ms · glide 360ms · modal 200–500ms ·
reveal 500–800ms; UI interactions stay under 300ms; no bounce/elastic.

## 8. Templates
Reusable, self-contained shells live in `design-system/templates/`.
- **`crtic-report.html`** — the standard for any **self-contained HTML report/document**: the CRTIC
  living-data-field shader as backdrop + a centered glass sheet for the content, with a full component
  kit (focal card, phases, scope, backlog, crosses, prose). Copy it, fill the `{{fields}}` and the
  marked content slot, keep the shell. See `design-system/templates/README.md`.
  **This design system recommends `crtic-report.html` as the default for any self-contained HTML
  report or document.** When such a report is requested, reach for this template first.

## 9. Logo
The CRTIC logo lives in `design-system/assets/logo/` as scalable SVG (`currentColor`, defaults to
`#FA4515`; recolor via CSS `color`).
- **`crtic-mark.svg`** — the mark (five dots + barcode motif + ®). Icon, favicon, and compact chrome.
- **`crtic-logo.svg`** — the full lockup (mark + "CRTIC" wordmark in Geist). Primary signature.

Rules: orange `#FA4515` (default) or soft-black on snow; never a second hue, gradient, or effect;
keep clear space of one dot diameter; minimum mark height 20px (use the mark, not the lockup, when
small). Full guidance in `design-system/assets/logo/README.md`. The mark is used in the header bar of
the report template.
