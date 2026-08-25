"use client";

import { useState } from "react";
import type { ReactElement } from "react";
import { PanelSlot } from "./PanelSlot";

/**
 * The strip of marks that stands for a long script's wait.
 *
 * WHY THIS EXISTS
 *   A script past `SEGMENT_MAX_CHARS` is not one generation, it is several —
 *   sent to the engine one at a time, each verified, some redone with a new
 *   seed when the verdict says so, then joined into one take. That is minutes,
 *   not seconds, and a single `StatusLine` saying "Generando" for four minutes
 *   straight tells the user nothing about where they actually are. This is
 *   the honest version of that wait: one mark per segment, filling in.
 *
 * PURE, LIKE ImprovePanel. Every value comes in through props; nothing here
 * calls a route or owns the sequencing. The caller (the long-script hook,
 * built elsewhere) decides what state each segment is in, drives `/api/
 * segments/*`, and wires the three callbacks below to its own actions.
 *
 * THE FIELD DOES NOT MOVE
 *   This mounts BELOW the script field, never inside it and never in place of
 *   it — the field keeping its centre was the whole point of the previous
 *   session's rework, and a strip that replaces or resizes the field would
 *   undo it. It is its own block, collapsed to a row of marks by default.
 *
 * OPENING A MARK REUSES PanelSlot, THE HOUSE'S ONE HEIGHT-ANIMATION MECHANISM
 *   Not a second one. `memory/medir-un-alto-no-incluye-los-margenes.md`
 *   documents exactly what goes wrong when a height is measured by hand
 *   instead — PanelSlot already gets it right, including the case (also true
 *   here) of switching from one open panel straight to another. See the
 *   `shownIndex`/`openIndex` pair below, which mirrors `tool`/`shownTool` in
 *   `app/page.tsx` for the same reason: PanelSlot keeps the last panel
 *   mounted while it collapses, and something has to remember what that was.
 *
 * WHAT THE MOTOR HONESTLY KNOWS, AND NOTHING MORE
 *   `/api/status` only ever answers "queued, at this position" or "running" —
 *   there is no percentage and no estimate anywhere in this product, `active`
 *   is typed to make that the only thing sayable, and nothing below ever
 *   prints a `%` or a countdown.
 *
 * FIVE STATES, EACH WITH ITS OWN SHAPE
 *   pendiente (empty ring) · generando (a crescent that breathes, using the
 *   house's existing `.breathe` rule) · hecho (a filled disc with a check) ·
 *   rehecho (a filled SQUARE with a redo arrow — a different silhouette on
 *   purpose, not a different tint of the same circle, because this is the one
 *   state that must never be mistaken for "hecho" by a reader who cannot use
 *   colour) · falló (a filled triangle with an exclamation). The one accent
 *   this app has covers three of the five, same as `StatusLine`'s dot covers
 *   both "running" and "failed" — the shape is what carries the meaning.
 */

export type SegmentBoundary = "sentence" | "paragraph";

export type SegmentState = "pending" | "generating" | "done" | "redone" | "failed";

export type SegmentInfo = {
  /** Dense, zero-based, ascending — the same ordering `/api/segments/split` returns. */
  index: number;
  /** The tramo's own text, shown when its mark is opened. */
  text: string;
  state: SegmentState;
  chars: number;
  /** Where the segmenter cut here — a full sentence, or a paragraph break. */
  boundary: SegmentBoundary;
  /** The seed behind the CURRENT take, once one exists ("done" or "redone"). */
  seed?: number;
  /** Set only when `state` is "failed" — the engine's own words, not a generic one. */
  error?: string;
};

/**
 * What `/api/status` says about the segment presently being generated. Never
 * a percentage or an elapsed/estimated time — the engine does not report
 * either, and this product does not invent them (see PRODUCT.md).
 */
export type EngineStatus = { kind: "queued"; position: number | null } | { kind: "running" };

/** Which segment the engine is on right now, and what it says about it. */
export type ActiveGeneration = { index: number; status: EngineStatus };

export type SegmentStripProps = {
  segments: SegmentInfo[];
  /** `null` when nothing is generating this instant — between segments, paused, or all done. */
  active: ActiveGeneration | null;
  /** Which mark's detail is open, or `null` when the strip is collapsed. */
  openIndex: number | null;
  /** "abrir" — toggling a mark calls this with its index, or `null` to close. */
  onOpen: (index: number | null) => void;
  /** "escuchar" — play the take currently held for this segment. */
  onListen: (index: number) => void;
  /** "rehacer" — the user asking for a fresh take of this one segment. */
  onRedo: (index: number) => void;
};

const STATE_LABEL: Record<SegmentState, string> = {
  pending: "pendiente",
  generating: "generando",
  done: "hecho",
  redone: "rehecho",
  failed: "falló",
};

/* ── Five shapes, not five tints of one shape ────────────────────────────
   `data-mark-shape` names the silhouette itself, independent of colour — the
   thing a reader who cannot use colour actually has to go on. */

function PendingGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      data-mark-shape="ring"
    >
      <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function GeneratingGlyph() {
  // A crescent: pending is an empty ring and done is a full disc, so "under
  // way" needs a silhouette of its own or it collapses into one of the other
  // two once colour and the breathing motion are both taken away.
  return (
    <span aria-hidden="true" data-mark-shape="crescent" className="breathe inline-flex">
      <svg width="10" height="10" viewBox="0 0 10 10">
        <circle cx="5" cy="5" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
        <path d="M5 1.4A3.6 3.6 0 0 1 5 8.6Z" fill="currentColor" />
      </svg>
    </span>
  );
}

function DoneGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      data-mark-shape="disc-check"
    >
      <circle cx="5" cy="5" r="4.2" fill="currentColor" />
      <path
        d="M2.8 5.2 4.2 6.6 7.3 3.2"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RedoneGlyph() {
  // A SQUARE, never a circle: this is the state where the app redid the work
  // on its own, and it has to be unmistakable at a glance from "hecho" — see
  // the file header. The loop arrow says *why* it looks different; the shape
  // is what makes that true even before it is read.
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      data-mark-shape="square-redo"
    >
      <rect x="0.9" y="0.9" width="8.2" height="8.2" rx="1.8" fill="currentColor" />
      <path
        d="M6.9 3.6a2.3 2.3 0 1 0 0.5 2.4"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M6.9 2.1v1.9h-1.9"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FailedGlyph() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      aria-hidden="true"
      data-mark-shape="triangle-alert"
    >
      <path d="M5 1 9.2 8.5H0.8Z" fill="currentColor" strokeLinejoin="round" />
      <path d="M5 3.8v2" stroke="var(--accent-ink)" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="5" cy="7.1" r="0.6" fill="var(--accent-ink)" />
    </svg>
  );
}

const MARK_ICON: Record<SegmentState, () => ReactElement> = {
  pending: PendingGlyph,
  generating: GeneratingGlyph,
  done: DoneGlyph,
  redone: RedoneGlyph,
  failed: FailedGlyph,
};

/** "En cola, posición 3" / "Generando" — the engine's own two answers, verbatim. */
function engineLabel(status: EngineStatus): string {
  if (status.kind === "running") return "Generando";
  return typeof status.position === "number" ? `En cola, posición ${status.position}` : "En cola";
}

/**
 * One mark, one tramo. 44×44 px of hit area around a small glyph — the target
 * is the button's own padding, not the drawing, so the strip can stay this
 * compact and still meet the touch-target floor.
 *
 * Colour and opacity are the only things that change between states — no
 * property that would move anything under `prefers-reduced-motion`, and
 * `--dur-press` / `--ease-ui` are the project's own tokens for exactly this:
 * a quick UI reaction, not a glide.
 */
function Mark({
  segment,
  open,
  onToggle,
}: {
  segment: SegmentInfo;
  open: boolean;
  onToggle: () => void;
}) {
  const Icon = MARK_ICON[segment.state];
  const label = `Tramo ${segment.index + 1}: ${STATE_LABEL[segment.state]}`;
  const tone = segment.state === "pending" ? "text-ink-muted" : "text-accent";
  const ring = open
    ? "bg-accent/12 shadow-[inset_0_0_0_1px_var(--accent)]"
    : "hover:bg-surface-raised";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={label}
      title={label}
      className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors duration-[var(--dur-press)] ease-[var(--ease-ui)] ${tone} ${ring}`}
    >
      <Icon />
    </button>
  );
}

/**
 * A tramo opened in place: its text, what came of it, and the two actions the
 * lead scoped for this component — escuchar and rehacer. Both are callbacks;
 * this component owns no `<audio>` and starts no request, on purpose (see the
 * file header).
 */
function SegmentDetail({
  segment,
  onListen,
  onRedo,
}: {
  segment: SegmentInfo;
  onListen: () => void;
  onRedo: () => void;
}) {
  const Icon = MARK_ICON[segment.state];
  const canListen = segment.state === "done" || segment.state === "redone";
  const canRedo =
    segment.state === "done" || segment.state === "redone" || segment.state === "failed";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className={segment.state === "pending" ? "text-ink-muted" : "text-accent"}>
            <Icon />
          </span>
          {`Tramo ${segment.index + 1} · ${STATE_LABEL[segment.state]}`}
        </p>
        <span className="font-mono text-[11px] tabular-nums text-ink-muted">
          {segment.chars} caracteres · {segment.boundary === "paragraph" ? "corte de párrafo" : "corte de frase"}
        </span>
      </div>

      <p className="mb-4 whitespace-pre-wrap rounded-md bg-surface-raised px-4 py-3 text-[14px] leading-relaxed text-ink">
        {segment.text}
      </p>

      {segment.state === "redone" && (
        // The app admitting it acted on its own — never hidden. See PRODUCT.md.
        <p className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          {"Este tramo no pasó la verificación y la aplicación lo rehizo sola, con otra semilla"}
          {typeof segment.seed === "number" ? ` (semilla ${segment.seed})` : ""}
          {"."}
        </p>
      )}

      {segment.state === "failed" && segment.error && (
        <p role="alert" className="mb-4 max-w-prose text-[13px] leading-relaxed text-ink">
          {segment.error}
        </p>
      )}

      {segment.state === "done" && typeof segment.seed === "number" && (
        <p
          className="mb-4 font-mono text-[11px] text-ink-muted"
          title="La semilla con la que se generó"
        >
          Semilla {segment.seed}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onListen}
          disabled={!canListen}
          className="rounded-full border border-hairline px-4 py-2 text-sm text-ink-muted transition-colors duration-200 hover:border-accent hover:text-accent-text disabled:cursor-not-allowed disabled:opacity-35"
        >
          Escuchar
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="text-sm text-ink-muted transition-colors duration-200 hover:text-ink disabled:cursor-not-allowed disabled:opacity-35"
        >
          {segment.state === "failed" ? "Reintentar" : "Rehacer"}
        </button>
      </div>
    </div>
  );
}

export function SegmentStrip({ segments, active, openIndex, onOpen, onListen, onRedo }: SegmentStripProps) {
  const total = segments.length;

  /**
   * `shownIndex` lags `openIndex` on the way down, exactly like `shownTool`
   * lags `tool` in `app/page.tsx` — PanelSlot unmounts nothing itself, so
   * something has to keep rendering the LAST open tramo until the collapse
   * animation actually finishes (`onClosed`), or the box would shrink from a
   * height that is already gone.
   *
   * Adjusted DURING render, not from a `useEffect`: this is React's own
   * documented pattern for "state that has to react to a prop changing" —
   * comparing against a ref of the previous prop and calling `setState`
   * mid-render triggers an immediate re-render before anything commits, with
   * no extra pass and no effect watching a prop for its own sake.
   */
  const [shownIndex, setShownIndex] = useState<number | null>(openIndex);
  const [lastOpenIndex, setLastOpenIndex] = useState<number | null>(openIndex);
  if (openIndex !== lastOpenIndex) {
    setLastOpenIndex(openIndex);
    if (openIndex !== null) setShownIndex(openIndex);
  }

  if (total === 0) return null;

  const shown = shownIndex !== null ? (segments.find((s) => s.index === shownIndex) ?? null) : null;

  const allSettled = segments.every((s) => s.state !== "pending" && s.state !== "generating");
  const anyFailed = segments.some((s) => s.state === "failed");
  const counter = active ? active.index + 1 : total;
  const phase = active
    ? engineLabel(active.status)
    : allSettled
      ? anyFailed
        ? "Con tramos fallados"
        : "Listo"
      : "En pausa";

  return (
    <section aria-label="Avance del guion largo">
      {/* One live region for the whole strip, not one per mark — a lector de
          pantalla does not need a running count of twelve individual beats,
          only when the PHASE changes. See the file header. */}
      <p role="status" aria-live="polite" className="eyebrow mb-3 flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${
            active ? "animate-pulse bg-accent" : anyFailed ? "bg-accent" : "bg-ink-muted/50"
          }`}
        />
        <span className="tabular-nums">{`Tramo ${counter} de ${total}`}</span>
        <span aria-hidden="true">·</span>
        <span>{phase}</span>
      </p>

      <div role="list" aria-label="Tramos" className="flex flex-wrap gap-1">
        {segments.map((segment) => (
          <div role="listitem" key={segment.index}>
            <Mark
              segment={segment}
              open={openIndex === segment.index}
              onToggle={() => onOpen(openIndex === segment.index ? null : segment.index)}
            />
          </div>
        ))}
      </div>

      <PanelSlot
        open={openIndex !== null}
        contentKey={shownIndex === null ? "none" : String(shownIndex)}
        onClosed={() => setShownIndex(null)}
      >
        {shown && (
          <SegmentDetail
            segment={shown}
            onListen={() => onListen(shown.index)}
            onRedo={() => onRedo(shown.index)}
          />
        )}
      </PanelSlot>
    </section>
  );
}
