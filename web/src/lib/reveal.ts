"use client";

import type { Origin } from "@/components/DockButton";

/**
 * Where a drawer's reveal starts, expressed in the drawer's own box.
 *
 * The point has to be the exact centre of the button that was pressed, or the
 * panel stops reading as that button having become it. Both sides get there
 * without measuring the drawer:
 *
 *   · A LEFT drawer is pinned to `left: 0`, so its local X is the viewport X.
 *   · A RIGHT drawer is pinned to `right: 0`, so its local X is most easily
 *     said as a distance from its own right edge — `calc(100% - d)` — where `d`
 *     is how far the button is from the right edge of the window. Its width
 *     never enters the arithmetic, which is what keeps this from duplicating a
 *     number that lives in the stylesheet.
 *
 * Called from the click handler, never from render: it reads `window`.
 */
export function revealAt(side: "left" | "right", origin: Origin): string {
  const x =
    side === "left"
      ? `${Math.round(origin.x)}px`
      : `calc(100% - ${Math.round(window.innerWidth - origin.x)}px)`;
  return `${x} ${Math.round(origin.y)}px`;
}

/** The centre of the panel, for the first paint before anything was pressed. */
export const REVEAL_CENTRE = "50% 50%";

/**
 * The clip-path for a panel that is open or closed.
 *
 * ⚠️ BOTH ENDS ARE `circle()`, and that is not a style choice. CSS interpolates
 * `clip-path` only between the same shape function, so pairing a closed
 * `circle()` with an open `inset()` does not animate at all — it snaps.
 *
 * 150% rather than a pixel radius because the circle has to cover the panel
 * from an origin that can sit anywhere in it, and a percentage radius is
 * resolved against the box's own diagonal.
 */
export function clipFor(open: boolean, at: string): string {
  return open ? `circle(150% at ${at})` : `circle(0px at ${at})`;
}
