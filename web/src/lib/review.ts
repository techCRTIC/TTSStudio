"use client";

import { useEffect, useState } from "react";

/**
 * A quiet, continuous read on the text's quality.
 *
 * WHY IT RUNS WHILE YOU TYPE
 *   So the rewrite control can mean something. A button that always looks the
 *   same is a button you learn to ignore; one that wakes up when your text has
 *   an actual problem is information. The two things it detects are the two
 *   measured levers — spelling and punctuation — and both fail silently in the
 *   engine, so the interface is the only place they can surface at all.
 *
 * It is affordable precisely because no model is involved: pure stdlib Python,
 * ~80 ms, no GPU. That is the whole reason the deterministic half was kept
 * separate from the rewrite (ADR-006).
 *
 * Same shape as ./suggestions: the verdict is stored WITH the text it was
 * computed from, so a stale one can never be rendered.
 */

const IDLE_MS = 900;

export type Verdict = {
  /** Something the engine will read badly. Worth interrupting for. */
  blocking: number;
  /** Everything found, blocking or not. */
  total: number;
};

const NONE = { source: "", verdict: { blocking: 0, total: 0 } };

export function useTextReview(text: string, enabled: boolean): Verdict | null {
  const [state, setState] = useState<{ source: string; verdict: Verdict }>(NONE);

  useEffect(() => {
    if (!enabled || !text.trim()) return;

    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/text/review", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          findings?: unknown[];
          blocking?: number;
        };
        setState({
          source: text,
          verdict: {
            blocking: payload.blocking ?? 0,
            total: payload.findings?.length ?? 0,
          },
        });
      } catch {
        // Silent by contract. See the route header.
      }
    }, IDLE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, enabled]);

  // Derived, never stored separately: a verdict about text the user has already
  // changed is not a verdict, and there is no effect racing to clear it.
  return state.source === text ? state.verdict : null;
}
