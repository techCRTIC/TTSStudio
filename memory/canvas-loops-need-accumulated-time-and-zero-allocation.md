---
name: canvas-loops-need-accumulated-time-and-zero-allocation
description: An animated canvas must accumulate its own time (never read the clock) and allocate nothing per frame, or it freezes-then-jumps and stutters rhythmically.
metadata:
  type: gotcha
---

Two independent causes of visible stutter in a requestAnimationFrame loop, both
hit in session 1 on the audio field backdrop.

**1. Reading the clock instead of accumulating time.** Passing
`performance.now()` into the draw function looks right until the loop pauses —
on a hidden tab, or under rAF throttling. The clock keeps advancing while the
canvas does not, so the first frame back leaps to where the animation "should"
be. It reads as freezing and then snapping. Accumulate instead, from a **capped**
delta, so a pause or a slow frame costs one ordinary step:

    const delta = last ? Math.min((now - last) / 1000, 0.05) : 0

**2. Allocating per frame.** Fresh point arrays and freshly built gradients,
sixty times a second, are a steady stream of garbage, and the collector pays for
it in pauses you can see as rhythmic hitching. Build buffers (`Float64Array`) and
gradients **once per resize**; for a gradient that must follow the pointer, build
it at the origin once and `translate()` into place.

**A third, subtler one from the same session:** an element highlighted *by its
index* inside a loop that starts at a wrapped offset will teleport every time the
offset wraps, because the index then refers to a different physical element. Give
anything distinguishable its own continuous position, and let the interchangeable
ones wrap.

**Why:** none of these are caught by types, lint, build or a design detector.
They are only visible to someone watching the animation.

**How to apply:** when a canvas "sometimes sticks", check these three before
suspecting the browser. Related: [[react-inline-style-fights-imperative-dom]]
