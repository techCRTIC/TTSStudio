"use client";

import { useCallback, useState } from "react";

/**
 * Running the rewrite, held outside the panel that shows it.
 *
 * The request starts from a click on the field's rail, and the result renders
 * below the field — two different places in the tree. Keeping the state here
 * lets the trigger be an ordinary event handler instead of an effect watching a
 * prop, which is both simpler and the only version React's rules allow.
 */

export type Finding = {
  level: "BLOQUEANTE" | "AVISO";
  code: string;
  message: string;
  action: string;
  examples?: string[];
};

export type ImproveResult = {
  findings: Finding[];
  blocking: number;
  proposal: string | null;
  warnings: string[];
  remaining: Finding[];
  modelError: string | null;
};

export type ImproveState =
  | { kind: "idle" }
  | { kind: "working"; startedAt: number }
  /** `source` is the text it describes; a result about older text is not one. */
  | { kind: "done"; source: string; result: ImproveResult }
  | { kind: "error"; message: string };

export function useImprove(): {
  state: ImproveState;
  run: (text: string) => void;
  reset: () => void;
} {
  const [state, setState] = useState<ImproveState>({ kind: "idle" });

  const run = useCallback((text: string) => {
    if (!text.trim()) return;
    setState({ kind: "working", startedAt: Date.now() });

    void (async () => {
      try {
        const res = await fetch("/api/text/improve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        const payload = await res.json();
        if (!res.ok) {
          setState({
            kind: "error",
            message: payload.message ?? "No se pudo revisar el texto.",
          });
          return;
        }
        setState({ kind: "done", source: text, result: payload as ImproveResult });
      } catch {
        setState({ kind: "error", message: "Se perdió la conexión con la app." });
      }
    })();
  }, []);

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { state, run, reset };
}
