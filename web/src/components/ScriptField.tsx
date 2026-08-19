"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The writing surface.
 *
 * It grows with what you write instead of sitting at a fixed height: a single
 * line should not reserve five, and a long script should not be read through a
 * slot. Past a ceiling it scrolls, and soft fades at the edges say so — a hard
 * cut looks like the text ends there.
 *
 * Shape borrowed from Componentes/AI-Chat-Box; motion is ours. The reference
 * springs with an overshoot, which this system bans, and it would be wrong here
 * anyway: a bounce fires on every keystroke, and a surface that wobbles while
 * you type is a surface you fight. Growth rides a short ease-out you feel
 * rather than watch.
 *
 * Height and fade opacity are written straight to the DOM. They are not React
 * state because nothing renders from them — putting them in state would mean a
 * re-render per keystroke to set a style the effect could set directly.
 */

const MIN_HEIGHT = 132; // roughly four lines at this size
const MAX_HEIGHT = 340; // past this it scrolls rather than pushing the card off-screen
const FADE = 36;

export function ScriptField({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const topFadeRef = useRef<HTMLDivElement>(null);
  const bottomFadeRef = useRef<HTMLDivElement>(null);

  const updateFades = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const below = scrollHeight - clientHeight - scrollTop;
    if (topFadeRef.current) {
      topFadeRef.current.style.opacity = String(Math.min(scrollTop / 24, 1));
    }
    if (bottomFadeRef.current) {
      bottomFadeRef.current.style.opacity = String(Math.min(Math.max(below - 4, 0) / 24, 1));
    }
  }, []);

  const resize = useCallback(() => {
    const el = areaRef.current;
    if (!el) return;

    /**
     * scrollHeight only reports the content height when the box is not already
     * taller than it. Collapsing to zero first is what makes shrinking work at
     * all — but it must not animate, or every keystroke plays a collapse. So the
     * transition is suspended for the measurement, the old height is restored,
     * a reflow is forced to commit it, and only then does the new height animate
     * from where it actually was.
     */
    const previous = el.style.height;
    el.style.transition = "none";
    el.style.height = "0px";
    const content = el.scrollHeight;
    el.style.height = previous;
    void el.offsetHeight;
    el.style.transition = "";

    const next = Math.max(MIN_HEIGHT, Math.min(content, MAX_HEIGHT));
    el.style.height = `${next}px`;
    el.style.overflowY = content > MAX_HEIGHT ? "auto" : "hidden";
    updateFades();
  }, [updateFades]);

  useEffect(resize, [value, resize]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return (
    <div className="field relative -mx-3 px-3 py-2">
      <textarea
        ref={areaRef}
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onScroll={updateFades}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit?.();
        }}
        spellCheck={false}
        placeholder={placeholder}
        style={{
          /**
           * `height` is deliberately ABSENT here and owned by the effect alone.
           *
           * As a React inline style it was re-applied on every render, so every
           * keystroke reset the box to its floor and the effect grew it back —
           * replaying the whole animation per character. The floor is now a
           * class (`min-h-[132px]`), which React never fights over, and the
           * measured height is written imperatively.
           *
           * The design detector flags animating `height` as a layout animation,
           * and it is right — this is a deliberate exception, not an oversight.
           * Its usual advice (transform, or grid-template-rows) has no
           * substitute here: transform would distort the text, and
           * grid-template-rows animates layout just the same while taking away
           * the explicit height the textarea needs in order to scroll at its
           * ceiling. The cost is bounded: it fires when the line count changes,
           * not per keystroke, for 150ms, over a small subtree. The canvas
           * behind is `position: fixed` and never re-lays-out with it.
           *
           * Under reduced motion the global rule drops `height` from the
           * animatable set, so growth becomes instant with no extra code.
           */
          transition: "height 150ms var(--ease-ui)",
        }}
        className="script-area min-h-[132px] w-full resize-none bg-transparent text-[19px] leading-[1.55] text-ink placeholder:text-ink-muted"
      />

      {/* The fades belong to the card's own surface, so the text dissolves into
          it rather than under a grey band. Purely a signal — aria-hidden. */}
      <div
        ref={topFadeRef}
        aria-hidden="true"
        style={{ height: FADE, opacity: 0 }}
        className="pointer-events-none absolute inset-x-3 top-2 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150"
      />
      <div
        ref={bottomFadeRef}
        aria-hidden="true"
        style={{ height: FADE, opacity: 0 }}
        className="pointer-events-none absolute inset-x-3 bottom-2 bg-gradient-to-t from-surface-raised to-transparent transition-opacity duration-150"
      />
    </div>
  );
}
