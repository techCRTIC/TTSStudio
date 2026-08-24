"use client";

import { useEffect, useRef } from "react";

/**
 * The one place the field's tool panels open into.
 *
 * WHY IT MEASURES INSTEAD OF USING grid-template-rows
 *   The stage's own unfold uses `0fr → 1fr`, which is the right technique when
 *   a box goes from closed to open. It cannot do the other two things this slot
 *   has to do:
 *
 *     · SWITCHING panels. `1fr` means "however tall the content is", so going
 *       from one panel to another is `1fr → 1fr` — no change to interpolate,
 *       and the height simply jumps.
 *     · The panel CHANGING SIZE while open. The rewrite goes from a short
 *       waiting line to a full list of findings, and that jumped too.
 *
 *   Measuring the content and animating an explicit height covers all three
 *   with one rule: opening is `0 → h`, switching is `h₁ → h₂`, closing is
 *   `h → 0`, and a panel growing under its own steam is `h → h'`. A
 *   ResizeObserver keeps it true without anyone remembering to re-measure.
 *
 * WHY THE CONTENT OUTLIVES THE CLOSE
 *   Because React unmounts children in the same render that closes the panel,
 *   so the box collapses from a height it no longer has — nothing to see. The
 *   caller keeps the last panel mounted until the transition ends; this
 *   component owns that timing so the caller does not have to.
 *
 * ⚠️ The design detector flags animating `height`, and it is right to. This is
 * a deliberate exception: its usual advice, `grid-template-rows`, is exactly
 * what cannot express two of the three cases above. The cost is bounded — it
 * runs on a press, over a small subtree, and the canvas behind the stage is
 * `position: fixed` and never re-lays-out with it.
 */

export function PanelSlot({
  open,
  /** Changes whenever the CONTENT changes identity, so it can be faded in. */
  contentKey,
  onClosed,
  children,
}: {
  open: boolean;
  contentKey: string;
  /** Fired once the collapse has finished, so the caller can unmount. */
  onClosed?: () => void;
  children: React.ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const apply = () => {
      /**
       * ⚠️ THE MEASURED ELEMENT MUST NOT HAVE MARGINS.
       *
       * A box's height excludes its own margins, so a measured element with
       * `margin-top: 20px` produces a slot twenty pixels shorter than the thing
       * inside it — and since the slot hides its overflow, those twenty pixels
       * come off the BOTTOM. It cut a button clean in half. The spacing is
       * padding on this element now, which is inside the measurement.
       *
       * `getBoundingClientRect`, not `offsetHeight`: the latter rounds to whole
       * pixels, and rounding DOWN loses the last row of a descender or a focus
       * ring. Ceiling a fractional height costs at most one pixel of slack.
       *
       * The price of that choice: this rect IS affected by transforms. The
       * measured element must never carry one. The entrance animation lives on
       * a DESCENDANT, whose transform does not touch this box — keep it there.
       */
      outer.style.height = open ? `${Math.ceil(inner.getBoundingClientRect().height)}px` : "0px";
    };

    apply();

    // The panel changes size on its own — a rewrite finishing, a seed being
    // named — and the slot has to follow without the caller reporting it.
    const observer = new ResizeObserver(apply);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open, contentKey]);

  useEffect(() => {
    if (open || !onClosed) return;
    const outer = outerRef.current;
    if (!outer) return;

    // Unmount when the collapse has actually finished, not on a timer that
    // would drift from the duration if anyone ever changed it.
    const done = (event: TransitionEvent) => {
      if (event.propertyName === "height") onClosed();
    };
    outer.addEventListener("transitionend", done);
    return () => outer.removeEventListener("transitionend", done);
  }, [open, onClosed]);

  return (
    <div
      ref={outerRef}
      inert={!open}
      style={{
        height: 0,
        overflow: "hidden",
        transition: "height var(--dur-glide) var(--ease-wave)",
      }}
    >
      {/* The measured box. Its top gap is PADDING, never margin — see `apply`. */}
      <div ref={innerRef} className="pt-5">
        <div className="max-h-[min(30vh,300px)] overflow-y-auto border-t border-hairline pt-5">
          {/* Keyed so a switch between panels replays the entrance: the height
              glides to the new size while the new contents rise into it.
              Without the key the swap is instant and reads as a glitch. */}
          <div key={contentKey} className="panel-in">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
