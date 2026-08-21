"use client";

import { useEffect, useId, useRef, useState } from "react";

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
 * Motion follows the house easings. The reference this borrows its shape from
 * uses a spring that overshoots; this design system bans bounce, so the panel
 * arrives on the quart curve instead.
 */

export type Option = { value: string; label: string };

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

export function Select({
  options,
  value,
  onChange,
  label,
  disabled,
  emptyLabel = "Sin opciones",
  /** "up" for a control near the bottom of the screen, "down" otherwise. */
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
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const generatedId = useId();
  const listboxId = `${generatedId}-listbox`;

  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const selected = options[selectedIndex];

  // Opening starts from what is selected, not from the top of the list.
  const show = () => {
    if (disabled || options.length === 0) return;
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
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

      <div
        id={listboxId}
        role="listbox"
        aria-label={label}
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        tabIndex={-1}
        inert={!open}
        style={{
          transitionDuration: "var(--dur-lift)",
          transitionTimingFunction: "var(--ease-ui)",
          transformOrigin: placement === "up" ? "bottom left" : "top left",
        }}
        className={`absolute left-0 z-40 max-h-[16rem] min-w-full overflow-y-auto rounded-lg border border-hairline bg-surface-raised p-1 transition-[opacity,transform] ${
          placement === "up" ? "bottom-full mb-2" : "top-full mt-2"
        } ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : `pointer-events-none scale-[0.98] opacity-0 ${
                placement === "up" ? "translate-y-1" : "-translate-y-1"
              }`
        }`}
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
      </div>
    </div>
  );
}
