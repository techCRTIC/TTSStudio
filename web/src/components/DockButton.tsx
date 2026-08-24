"use client";

import { useRef } from "react";

/**
 * A round control flanking the stage, which becomes its panel.
 *
 * WHY IT SITS ON THE CARD AND NOT ON THE SCREEN EDGE
 *   The two drawers belong to the writing surface — what goes IN on the left,
 *   what comes OUT on the right — so their handles belong beside it. Anchored
 *   to the card they also travel with it when it unfolds, which keeps the
 *   relationship visible instead of leaving two marks stranded at the edges of
 *   a wide monitor.
 *
 * WHY IT REPORTS ITS OWN CENTRE
 *   Because the panel is revealed by a circle that starts exactly here. The
 *   button does not open the drawer, it BECOMES it: the same point on screen is
 *   the last thing you touched and the first thing the panel grows from. That
 *   only holds if the origin is measured rather than guessed, since the card —
 *   and therefore this button — moves when the stage unfolds.
 */

export type Origin = { x: number; y: number };

export function DockButton({
  side,
  label,
  count,
  open,
  onOpen,
  children,
}: {
  side: "left" | "right";
  label: string;
  /** How many things are inside. Absent when there are none. */
  count?: number;
  open: boolean;
  /** Receives the button's centre, in viewport coordinates. */
  onOpen: (origin: Origin) => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const press = () => {
    const rect = ref.current?.getBoundingClientRect();
    onOpen(
      rect
        ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        : // A sane fallback rather than a crash: reveal from the middle of the
          // side the panel lives on.
          { x: side === "left" ? 0 : window.innerWidth, y: window.innerHeight / 2 },
    );
  };

  return (
    <button
      ref={ref}
      type="button"
      onClick={press}
      aria-expanded={open}
      aria-label={count ? `${label} · ${count}` : label}
      title={label}
      /**
       * The open state is a DATA ATTRIBUTE, not an inline style.
       *
       * ⚠️ An inline `transform` beats every stylesheet rule, so writing one
       * here would silently kill the hover and press transforms — the control
       * would look inert. The same class of mistake (a hand-written property
       * overriding the one already doing that job) is what sent the old edge
       * tabs to the bottom of the page.
       *
       * Hidden while its panel is open, because it IS that panel: leaving it on
       * screen would be the same object in two places.
       */
      data-open={open}
      /**
       * Anchored to the CARD on a wide window and to the WINDOW on a narrow
       * one.
       *
       * Beside the card is where it belongs — it travels with the stage and
       * reads as part of it. But the card is 768px at full width, and two
       * handles hanging 76px off its edges need about 940px of window before
       * the left one starts leaving the screen. Below that the handle keeps its
       * job by keeping its position instead of its relationship.
       */
      className={`dock-button fixed top-1/2 z-10 grid h-14 w-14 place-items-center rounded-full lg:absolute ${
        side === "left" ? "left-3 lg:-left-[4.75rem]" : "right-3 lg:-right-[4.75rem]"
      }`}
    >
      {children}
      {typeof count === "number" && count > 0 && (
        <span className="dock-count font-mono">{count}</span>
      )}
    </button>
  );
}

export function VoicesIcon() {
  return (
    <svg width="19" height="15" viewBox="0 0 20 16" fill="none" aria-hidden="true">
      {[
        [1, 6, 4],
        [5, 2.5, 11],
        [9.5, 4.5, 7],
        [14, 1, 14],
        [18.5, 5.5, 5],
      ].map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="1.6" height={h} rx="0.8" fill="currentColor" />
      ))}
    </svg>
  );
}

export function TakesIcon() {
  return (
    <svg width="18" height="16" viewBox="0 0 18 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.5h13M2.5 8h13M2.5 12.5h8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
