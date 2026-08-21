"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The project's own dropdown.
 *
 * A native <select> is correct and ugly: it renders the operating system's own
 * popup, with its own chrome, its own arrow and its own idea of what a menu
 * looks like — none of which belong to this surface. The voice picker was
 * rebuilt for exactly that reason; this is that picker generalised, so there is
 * one accessible listbox in the project instead of one per dropdown.
 *
 * Rebuilt WHOLE or not at all: a custom listbox that is not accessible is a
 * worse trade than the ugly control it replaced, because the native one came
 * with keyboard support for free. Arrow keys move, Home/End jump, Enter and
 * Space choose, Escape closes and returns focus, Tab closes, a click outside
 * closes, and the roles say what this is.
 *
 * ⚠️ THE PANEL IS PORTALLED TO <body>, AND THAT IS NOT OPTIONAL.
 *   An absolutely-positioned panel is clipped by any ancestor with
 *   `overflow: hidden`, and this project has one exactly where a dropdown lives:
 *   the advanced panel folds with grid-template-rows and needs that overflow to
 *   fold at all. The language picker rendered cut in half in it — measured, in
 *   the browser, not theorised. Positioning is `fixed` against the trigger's own
 *   rect, recomputed while open so scrolling does not leave it stranded.
 */

export type Option = { value: string; label: string };

/** Where the panel sits relative to its trigger, in viewport coordinates. */
type Rect = { left: number; top: number; bottom: number; width: number };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform var(--dur-lift) var(--ease-ui)",
      }}
    >
      <path
        d="M2 3.75 5 6.75l3-3"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const GAP = 8; // between the trigger and the panel
const MARGIN = 12; // the closest the panel may come to the viewport edge

export function Select({
  options,
  value,
  onChange,
  label,
  disabled,
  emptyLabel = "Sin opciones",
  /** Preferred side. Flipped automatically when that side has no room. */
  placement = "down",
  /** "pill" matches the voice picker; "field" matches a form field. */
  variant = "pill",
  id,
  labelledBy,
}: {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  /** Names the listbox for screen readers. */
  label: string;
  disabled?: boolean;
  emptyLabel?: string;
  placement?: "up" | "down";
  variant?: "pill" | "field";
  id?: string;
  /**
   * Id of the visible caption sitting above this control. Without it the
   * trigger announces only its current value — "Español, botón" — and never
   * says what that value is FOR. A <label> cannot do this job: the trigger is
   * a button, not an input.
   */
  labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  const measure = (): Rect | null => {
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return null;
    return { left: box.left, top: box.top, bottom: box.bottom, width: box.width };
  };

  // Opening starts from what is selected, not from the top of the list.
  const show = () => {
    if (disabled || options.length === 0) return;
    setRect(measure());
    setActive(selectedIndex);
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const option = options[index];
    if (option) onChange(option.value);
    close();
  };

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      // The panel is portalled, so it is NOT inside rootRef — both have to be
      // checked or clicking an option would count as clicking outside.
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    // A fixed panel does not follow the page; it has to be told to.
    const reposition = () => setRect(measure());

    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        show();
      }
      return;
    }

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close();
        break;
      case "Tab":
        setOpen(false);
        break;
      case "ArrowDown":
        event.preventDefault();
        setActive((i) => (i + 1) % options.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + options.length) % options.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(options.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
    }
  };

  const trigger =
    variant === "pill"
      ? "flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink-muted disabled:opacity-40"
      : // The field variant matches the surrounding inputs: full width, the
        // same radius, and the same resting rim, so a row of controls reads as
        // one row rather than as a pill that wandered into a form.
        "field flex w-full items-center justify-between gap-2 px-3 py-2 text-sm text-ink disabled:opacity-40";

  /**
   * Decide the side and the height from the room actually available.
   *
   * The preferred side wins unless it genuinely has less room than the other,
   * and the panel is then capped to whatever that side offers — so it scrolls
   * internally instead of running off the screen.
   */
  const panelPosition = (() => {
    if (!rect) return null;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const goesUp = placement === "up" ? above > 120 || above >= below : below < 160 && above > below;
    const room = Math.max(120, goesUp ? above : below);
    return {
      goesUp,
      style: {
        position: "fixed" as const,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(room, 320),
        ...(goesUp
          ? { bottom: window.innerHeight - rect.top + GAP }
          : { top: rect.bottom + GAP }),
        // Feeds the entry keyframes, so the panel drifts in from the side it
        // is attached to rather than always from above.
        ["--menu-from-y" as string]: goesUp ? "4px" : "-4px",
      },
    };
  })();

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        id={id}
        type="button"
        disabled={disabled || options.length === 0}
        onClick={() => (open ? close(false) : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelledBy ? `${labelledBy} ${listboxId}-value` : undefined}
        aria-controls={open ? listboxId : undefined}
        className={trigger}
      >
        <span id={`${listboxId}-value`} className="truncate">
          {selected?.label ?? emptyLabel}
        </span>
        <span className="text-ink-muted">
          <ChevronIcon open={open} />
        </span>
      </button>

      {open &&
        panelPosition &&
        createPortal(
          <div
            ref={panelRef}
            id={listboxId}
            role="listbox"
            aria-label={label}
            aria-activedescendant={`${listboxId}-${active}`}
            tabIndex={-1}
            style={panelPosition.style}
            className="menu-in z-50 min-w-[10rem] overflow-y-auto overscroll-contain rounded-lg border border-hairline bg-surface-raised p-1 shadow-[var(--rim-strong)]"
          >
            {options.map((option, index) => {
              const isSelected = option.value === value;
              return (
                <div
                  key={option.value}
                  id={`${listboxId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(index)}
                  onClick={() => choose(index)}
                  className={`flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                    index === active ? "bg-surface text-ink" : "text-ink-muted"
                  }`}
                >
                  <span>{option.label}</span>
                  {/* The accent marks the chosen one, once. */}
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full bg-accent transition-opacity duration-150 ${
                      isSelected ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
