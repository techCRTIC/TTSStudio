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
/** Past this it scrolls rather than pushing the card off-screen. */
export const MAX_HEIGHT = 340;
/**
 * The ceiling while one of the field's tool panels is open.
 *
 * ⚠️ This is what keeps the stage centred. The card is vertically centred in
 * the viewport, so a panel opening under the field would push the whole thing
 * past the fold — and the reader would have to scroll to reach the very button
 * they were heading for. Instead the field gives the panel the room, through
 * the growth transition it already had.
 */
export const MAX_HEIGHT_COMPACT = 160;
const FADE = 36;

export function ScriptField({
  id,
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  inputRef,
  maxHeight = MAX_HEIGHT,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Lets the stage put the caret here the moment it unfolds. */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Ceiling before the field scrolls. Lowered while a tool panel is open. */
  maxHeight?: number;
}) {
  // One stable internal ref. A conditional `inputRef ?? ownRef` would not be a
  // stable identity, which costs the memoisation of everything reading it; the
  // caller's ref is mirrored on the element instead.
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const topFadeRef = useRef<HTMLDivElement>(null);
  const bottomFadeRef = useRef<HTMLDivElement>(null);
  // What the ceiling was last time the box was measured. It is the only way to
  // tell the two reasons a height changes apart — see `resize`.
  const lastCeilingRef = useRef(maxHeight);

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
    // Clearing the shorthand also clears any duration override left by a
    // previous ceiling move, so the next content-driven resize falls back to
    // the stylesheet's short ease without anyone having to remember to reset it.
    el.style.transition = "";

    /**
     * A height changes for two different reasons, and they want two tempos.
     *
     *   The CONTENT grew — you typed past the end of a line. Small, frequent,
     *   something to feel rather than watch: the short ease from the stylesheet.
     *
     *   The CEILING moved — a tool panel opened and the field is handing over
     *   its room. That is one half of a single gesture whose other half is the
     *   panel unfolding, and the two have to move together or you see a gap
     *   open and then fill. So it borrows the panel's own glide.
     */
    const ceilingMoved = lastCeilingRef.current !== maxHeight;
    lastCeilingRef.current = maxHeight;

    if (ceilingMoved) {
      el.style.transitionDuration = "var(--dur-glide)";
      el.style.transitionTimingFunction = "var(--ease-wave)";
    }

    const next = Math.max(MIN_HEIGHT, Math.min(content, maxHeight));
    el.style.height = `${next}px`;
    el.style.overflowY = content > maxHeight ? "auto" : "hidden";
    updateFades();
  }, [updateFades, maxHeight]);

  useEffect(resize, [value, resize]);

  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return (
    <div className="field relative -mx-3 px-3 py-2">
      <textarea
        ref={(node) => {
          areaRef.current = node;
          if (inputRef) inputRef.current = node;
        }}
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
        /**
         * No `style` prop at all, and that is the point.
         *
         * `height` is owned by the effect: as a React inline style it was
         * re-applied on every render, so every keystroke reset the box to its
         * floor and the effect grew it back, replaying the whole animation per
         * character. `transition` left for the same reason — the effect
         * overrides its duration when the ceiling moves, and React would stomp
         * that on the next render. Both live in `.script-area` now, which React
         * never fights over. See memory/react-inline-style-fights-imperative-dom.
         */
        className="script-area min-h-[132px] w-full resize-none bg-transparent text-[19px] leading-[1.55] text-ink placeholder:text-ink-muted"
      />

      {/* The fades belong to the card's own surface, so the text dissolves into
          it rather than under a grey band. Purely a signal — aria-hidden. */}
      <div
        ref={topFadeRef}
        aria-hidden="true"
        style={{ height: FADE, opacity: 0 }}
        className="pointer-events-none absolute inset-x-3 top-2 z-20 bg-gradient-to-b from-surface-raised to-transparent transition-opacity duration-150"
      />
      <div
        ref={bottomFadeRef}
        aria-hidden="true"
        style={{ height: FADE, opacity: 0 }}
        className="pointer-events-none absolute inset-x-3 bottom-2 z-20 bg-gradient-to-t from-surface-raised to-transparent transition-opacity duration-150"
      />
    </div>
  );
}
