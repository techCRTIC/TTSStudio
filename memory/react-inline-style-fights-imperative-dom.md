---
name: react-inline-style-fights-imperative-dom
description: If an effect writes a style property imperatively, that property must NOT also appear in React's inline style — React re-applies it on every render and overwrites the effect.
metadata:
  type: gotcha
---

A measured value written to the DOM by an effect (`el.style.height = ...`) is
**overwritten on every render** if the same property is also in the element's
React `style={{...}}` prop. React reapplies its own value first; the effect then
sets it again.

**Why:** in session 1 this made the auto-growing text area replay its whole
150ms animation on every single keystroke — React reset the height to the floor,
the effect grew it back. It looked like the animation was broken rather than
running twice, and it passed types, lint, build and the design detector. The
user found it by using the app.

**How to apply:** split ownership cleanly.
- The resting/minimum value goes in a **class** (`min-h-[132px]`), which React
  never fights over.
- The **measured** value is written only by the effect.
- Keep non-conflicting properties (like `transition`) in the inline style; they
  are set once and never contested.

The same rule covers `width`, `transform` and anything else measured at runtime.

Related: [[canvas-loops-need-accumulated-time-and-zero-allocation]]
