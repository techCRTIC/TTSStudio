"use client";

import { useEffect, useRef } from "react";

/**
 * What the engine is doing, said beside the text being written rather than in
 * the top bar — the status belongs to the take you are making, not to the app.
 *
 * The label changes length as it changes meaning ("Listo" → "En cola, posición
 * 2" → "Generando"), and a label that changes length shoves its neighbours
 * around. MorphingText, borrowed from Componentes/AI-Chat-Box, animates the
 * width between the two so the row settles instead of jumping, and the new word
 * arrives on its own.
 *
 * What was NOT borrowed: the reference's five reactive bars. They visualise a
 * real microphone level there. Here nothing measurable exists while ComfyUI
 * works — it reports queued and running, not progress — so animated bars would
 * be a spinner wearing a meter's clothes, against this product's own rule that
 * waiting is shown honestly. The queue position is the real information, and it
 * is what the label says.
 */

function MorphingText({ text }: { text: string }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  /**
   * Width is written to the DOM rather than held in state: it is a measurement
   * of the DOM applied back to the DOM, and as state it would cost a second
   * render for every word plus a setState inside an effect.
   */
  useEffect(() => {
    if (boxRef.current && measureRef.current) {
      boxRef.current.style.width = `${measureRef.current.offsetWidth}px`;
    }
  }, [text]);

  return (
    <span
      ref={boxRef}
      style={{
        /**
         * The detector flags animating `width` as a layout animation, and it is
         * right — this is the second documented exception in this codebase, and
         * like the first it has no substitute: scaleX would stretch the letters,
         * and a fixed width would either clip "En cola, posición 2" or make
         * "Listo" reserve room for it forever.
         *
         * The cost is small and bounded: one inline span, animated on discrete
         * status changes — a handful per generation, never per frame. The row
         * uses justify-between, so nothing is pushed around while it settles.
         */
        transition: "width var(--dur-lift) var(--ease-ui)",
      }}
      className="relative inline-flex overflow-hidden whitespace-nowrap"
    >
      {/* Holds the row's height and measures the incoming text. */}
      <span ref={measureRef} className="invisible">
        {text}
      </span>
      {/* Keyed so each new word mounts fresh and plays its entrance. */}
      <span key={text} className="status-in absolute inset-0 whitespace-nowrap">
        {text}
      </span>
    </span>
  );
}

export type Phase = "idle" | "queued" | "running" | "done" | "failed";

export function StatusLine({ phase, detail }: { phase: Phase; detail: string }) {
  const live = phase === "queued" || phase === "running";
  // On failure the line only names the state; the message itself belongs to the
  // alert below, and printing it in both places says the same thing twice.
  const label = phase === "idle" ? "Listo" : phase === "failed" ? "Falló" : detail;

  return (
    <span
      role="status"
      aria-live="polite"
      className={`eyebrow flex items-center gap-2 ${
        phase === "failed" ? "text-accent-text" : ""
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-200 ${
          live ? "animate-pulse bg-accent" : phase === "failed" ? "bg-accent" : "bg-ink-muted/50"
        }`}
      />
      <MorphingText text={label} />
    </span>
  );
}
