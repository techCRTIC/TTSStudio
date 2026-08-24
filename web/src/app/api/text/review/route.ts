/**
 * What is wrong with this text — the deterministic half, on its own.
 *
 * Separate from /api/text/improve because it is a different KIND of call. This
 * one runs while the user types: pure stdlib, ~80 ms, no model, no GPU. It
 * exists so the rewrite control can carry an honest signal — it lights up when
 * there is genuinely something to fix, rather than sitting there decoratively
 * asking to be pressed.
 *
 * Failure is silent. This is the only thing in the app that runs unasked while
 * the user types, so it has to be invisible when it cannot answer: a review
 * that interrupts writing to report that it could not review is worse than one
 * that quietly says nothing.
 */

import { reviewText } from "@/lib/text-quality";

export const dynamic = "force-dynamic";

/** Below this there is not enough text for a verdict to mean anything. */
const MIN_CHARS = 12;

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
    const text = typeof body?.text === "string" ? body.text : "";

    if (text.trim().length < MIN_CHARS) {
      return Response.json({ findings: [], blocking: 0 });
    }

    const review = await reviewText(text);
    return Response.json({ findings: review.findings, blocking: review.blocking });
  } catch {
    return Response.json({ findings: [], blocking: 0 });
  }
}
