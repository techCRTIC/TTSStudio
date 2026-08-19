"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The voice picker.
 *
 * A native <select> was correct and ugly: it renders the operating system's own
 * popup, which arrives with its own chrome, its own arrow and its own idea of
 * what a menu looks like — none of which belong to this surface.
 *
 * So it is rebuilt, but rebuilt WHOLE: a custom listbox that is not accessible
 * is a worse trade than the ugly control it replaced, because the native one
 * came with keyboard support for free. Arrow keys move, Home/End jump, Enter
 * and Space choose, Escape closes and returns focus, Tab closes, a click
 * outside closes, and the roles say what this is.
 *
 * Motion follows the house easings. The reference this borrows its shape from
 * uses a spring that overshoots; this design system bans bounce, so the panel
 * arrives on the quart curve instead.
 */

export type Voice = { id: string; label: string };

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

export function VoiceSelect({
  voices,
  value,
  onChange,
  disabled,
}: {
  voices: Voice[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listboxId = useId();

  const selectedIndex = Math.max(0, voices.findIndex((v) => v.id === value));
  const selected = voices[selectedIndex];

  // Opening starts from what is selected, not from the top of the list.
  const show = () => {
    if (disabled || voices.length === 0) return;
    setActive(selectedIndex);
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const choose = (index: number) => {
    const voice = voices[index];
    if (voice) onChange(voice.id);
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
        setActive((i) => (i + 1) % voices.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((i) => (i - 1 + voices.length) % voices.length);
        break;
      case "Home":
        event.preventDefault();
        setActive(0);
        break;
      case "End":
        event.preventDefault();
        setActive(voices.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(active);
        break;
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled || voices.length === 0}
        onClick={() => (open ? close(false) : show())}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className="flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2 text-sm text-ink transition-colors duration-200 hover:border-ink-muted disabled:opacity-40"
      >
        <span>{selected?.label ?? "Sin voces"}</span>
        <span className="text-ink-muted">
          <ChevronIcon open={open} />
        </span>
      </button>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Voces"
        aria-activedescendant={open ? `${listboxId}-${active}` : undefined}
        tabIndex={-1}
        inert={!open}
        style={{
          transitionDuration: "var(--dur-lift)",
          transitionTimingFunction: "var(--ease-ui)",
          transformOrigin: "bottom left",
        }}
        className={`absolute bottom-full left-0 z-40 mb-2 min-w-[13rem] rounded-lg border border-hairline bg-surface-raised p-1 transition-[opacity,transform] ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-1 scale-[0.98] opacity-0"
        }`}
      >
        {voices.map((voice, index) => {
          const isSelected = voice.id === value;
          return (
            <div
              key={voice.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={isSelected}
              onPointerEnter={() => setActive(index)}
              onClick={() => choose(index)}
              className={`flex cursor-default items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150 ${
                index === active ? "bg-surface text-ink" : "text-ink-muted"
              }`}
            >
              <span>{voice.label}</span>
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
