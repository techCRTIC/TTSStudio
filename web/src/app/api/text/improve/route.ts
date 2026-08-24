/**
 * The improve button: three steps, and only the last one is a model.
 *
 * THE ORDER MATTERS AND IS NOT ARBITRARY
 *   1. REVIEW (deterministic). What is wrong and why, with the measurement
 *      behind it. `execution/tts_revisar_texto.py`.
 *   2. NORMALIZE (deterministic). Numbers, dates and amounts into their spoken
 *      form. "31/12/2026" has exactly one correct reading in Spanish, so this
 *      is not a judgement call and a model has no business making it.
 *      `execution/tts_normalizar_texto.py`.
 *   3. REWRITE (the model). Only the rhythm and the accents — the part a rule
 *      cannot decide.
 *
 *   Doing 2 before 3 also keeps the model from re-introducing digits: it sees
 *   "treinta y uno de diciembre" already written out.
 *
 * ⚠️ NOTHING HERE EDITS THE USER'S TEXT. It returns a proposal and the reasons
 * for it. That is the same shape as the transcription step in ADR-003 — the
 * machine drafts, the human approves — and here it is not caution in the
 * abstract: on the first test run the model turned "el año pasado cambió todo"
 * into "cambié todo", fixing every accent and changing who did what.
 *
 * The model is optional by design: if ollama is not running, the deterministic
 * half still answers. Half of this button is the valuable half.
 */

import { normalizeText, reviewText, type Finding } from "@/lib/text-quality";
import { ModelUnavailableError, proposeRewrite } from "@/lib/llm";

export const dynamic = "force-dynamic";

export type ImproveResponse = {
  /** What is wrong with what the user wrote, worst first. */
  findings: Finding[];
  /** Blocking problems in the original. Not a style opinion — see text-quality. */
  blocking: number;
  /** The proposed text, or null when the model could not be reached. */
  proposal: string | null;
  /** What is left for a human to decide — chiefly how an acronym is pronounced. */
  warnings: string[];
  /** Findings that remain in the proposal. Evidence it is better, not a claim. */
  remaining: Finding[];
  /** Present when the model half failed; the deterministic half still answered. */
  modelError: string | null;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";

    if (!text.trim()) {
      return Response.json(
        { error: "empty", message: "No hay texto que mejorar." },
        { status: 400 },
      );
    }

    const [review, normalized] = await Promise.all([reviewText(text), normalizeText(text)]);

    let proposal: string | null = null;
    let modelError: string | null = null;

    try {
      const rewritten = await proposeRewrite(normalized.text);
      // An empty or absurdly short answer is not a proposal. Better to say the
      // model gave nothing than to offer the user a truncated script.
      proposal = rewritten.length >= Math.min(8, normalized.text.length) ? rewritten : null;
      if (!proposal) modelError = "El modelo no devolvió una reescritura utilizable.";
    } catch (cause) {
      // The deterministic half is still worth returning. A missing model must
      // not turn "here is what is wrong with your text" into an error page.
      modelError =
        cause instanceof ModelUnavailableError
          ? cause.message
          : `El modelo falló: ${cause instanceof Error ? cause.message : String(cause)}`;
      // Normalization alone is already an improvement when it changed anything.
      proposal = normalized.text !== text ? normalized.text : null;
    }

    // Re-review the proposal rather than asserting it is better. If it still
    // carries findings, the interface says so.
    const remaining = proposal ? (await reviewText(proposal)).findings : [];

    const payload: ImproveResponse = {
      findings: review.findings,
      blocking: review.blocking,
      proposal,
      warnings: normalized.warnings,
      remaining,
      modelError,
    };

    return Response.json(payload);
  } catch (cause) {
    return Response.json(
      {
        error: "improve_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 500 },
    );
  }
}
