"use client";

/**
 * The field's tools, standing beside it.
 *
 * WHY A RAIL AND NOT TWO MORE ROWS
 *   Both tools used to sit under the writing surface, each costing a row of
 *   height whether or not it was ever opened. The stage is centred in the
 *   viewport, so every resting pixel it spends on a control it is not using is
 *   a pixel the primary act — writing and generating — gives up, and past a
 *   point the whole card stops fitting and starts scrolling.
 *
 *   Vertically the rail costs nothing: it stands in the field's own row, in
 *   space the text was never going to use. And it puts each tool next to the
 *   thing it acts on, which is where a tool belongs.
 *
 * THE MARKS ARE NOT DECORATION, AND THEY DIFFER ON PURPOSE
 *   - A **static dot** means "you changed something here": a pinned seed, a
 *     language other than the default. It is a state the user chose and it only
 *     needs to be visible, not urgent.
 *   - A **breathing dot** means "there is something here worth your attention":
 *     the text carries a finding the engine will read badly. It stops the
 *     moment the text is clean.
 *
 *   A control that always looks the same is a control you learn to ignore, and
 *   a mark that never stops moving is a spinner nobody asked for. Reduced
 *   motion collapses the breath to its resting frame through the global rule.
 */

function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 1.6 9.5 5.6 13.5 7 9.5 8.4 8 12.4 6.5 8.4 2.5 7 6.5 5.6 8 1.6Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M12.6 11.2v2.6M13.9 12.5h-2.6"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 4.5h11M2.5 11.5h11"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
      <circle cx="6" cy="4.5" r="1.9" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.15" />
      <circle cx="10.5" cy="11.5" r="1.9" fill="var(--surface-raised)" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export type Tool = "improve" | "advanced" | null;

function RailTool({
  label,
  open,
  mark,
  onClick,
  children,
}: {
  label: string;
  open: boolean;
  /** "none" · "set" (you changed it) · "attention" (something to fix). */
  mark: "none" | "set" | "attention";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className="rail-tool"
    >
      {children}
      {mark !== "none" && (
        <span
          aria-hidden="true"
          className={mark === "attention" ? "rail-dot breathe" : "rail-dot"}
        />
      )}
    </button>
  );
}

export function ToolRail({
  open,
  onOpen,
  advancedModified,
  textMark,
  disabled,
}: {
  open: Tool;
  onOpen: (tool: Tool) => void;
  /** The advanced options are off their defaults. */
  advancedModified: boolean;
  /**
   * What the live review has to say about the text.
   *
   * "attention" is reserved for a BLOCKING finding — text the engine will
   * genuinely read badly. Ordinary suggestions get the static dot: they are
   * worth a look, not worth pulling the eye off the sentence being written. A
   * mark that breathes at every stray digit is the same as no mark at all.
   */
  textMark: "none" | "set" | "attention";
  disabled?: boolean;
}) {
  // Pressing the open tool closes it. One panel at a time is what keeps the
  // card's height bounded, which is the point of the whole arrangement.
  const toggle = (tool: Exclude<Tool, null>) => onOpen(open === tool ? null : tool);

  return (
    <div
      className="flex shrink-0 flex-col gap-1 pt-1"
      style={{ opacity: disabled ? 0.4 : 1, pointerEvents: disabled ? "none" : undefined }}
    >
      <RailTool
        label="Escribirlo para la voz"
        open={open === "improve"}
        mark={textMark}
        onClick={() => toggle("improve")}
      >
        <SparkIcon />
      </RailTool>

      <RailTool
        label="Opciones avanzadas"
        open={open === "advanced"}
        mark={advancedModified ? "set" : "none"}
        onClick={() => toggle("advanced")}
      >
        <SlidersIcon />
      </RailTool>
    </div>
  );
}
