# CRTIC Templates

Reusable, self-contained templates in the CRTIC clean system.

## `crtic-report.html` — Self-contained HTML report

The standard shell for **any self-contained HTML report or document** for CRTIC.

- **Background:** the CRTIC "living data field" shader (Canvas 2D waves on a
  monochrome orange ramp, flowing data dots, cursor spotlight, pointer parallax).
- **Content:** a centered glass sheet floating over the shader (earned
  translucency, a veil over live media, not glassmorphism by default).
- **Chrome:** sticky CRTIC bar, hero (title/eyebrow/meta/tagline), footer.

### How to use

1. Copy `crtic-report.html` to the report's location and rename it.
2. Fill the `{{DOUBLE_BRACE}}` fields in the hero and footer
   (`{{TITLE}}`, `{{EYEBROW}}`, `{{LEAD}}`, `{{META}}`, `{{TAGLINE}}`,
   `{{BAR_LABEL}}`, `{{FOOTER_BIG}}`, `{{FOOTER_NOTE}}`, `{{FOOTER_SOURCES}}`).
3. Replace the marked **CONTENT SLOT** with your sections. A component kit is
   embedded as commented snippets inside the slot: copy the blocks you need.
4. Do **not** touch the shader or the glass shell. Only fill the center.

### Component kit (classes available inside the slot)

`.prose` · `.focal` (verdict grid) · `.phases`/`.phase` (timeline) ·
`.scope` (two columns) · `.backlog`/`.item` (list) · `.crosses`/`.cross`
(callouts) · `.meta-row` · `.sec-head` (eyebrow + h2 + kicker). Add `reveal`
to any block for the scroll-in animation.

### Rules (CRTIC clean)

- One orange only (`#FA4515`), used sparingly. Monochrome everywhere else.
- **No em dashes** in copy (and not `--`). Commas, colons, periods, parentheses.
- Self-contained: everything inline, no external fonts/scripts/images.
- Honor `prefers-reduced-motion` (already wired).

First use in the wild: [`docs/oraculo-resumen-v1.html`](../../docs/oraculo-resumen-v1.html)
(the Oráculo directives summary), which this template was extracted from.
