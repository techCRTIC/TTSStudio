/**
 * How does this script get cut? Fase 3 (guiones largos), ADR-007 § D1.
 *
 * WHY THIS EXISTS
 *   The engine cannot say a multi-minute script in one call, so a long script
 *   is cut into segments that each end on a sentence boundary — never
 *   mid-sentence, because cutting inside a sentence ruins the delivery of both
 *   halves. `execution/tts_trocear_guion.py` does that cutting, deterministically
 *   and with its own tests; this route is the only way the browser can reach it.
 *
 * ⚠️ CALLING THIS IS NOT HOW YOU DECIDE WHETHER A SCRIPT IS LONG.
 *   That decision is a character count against `SEGMENT_MAX_CHARS` in
 *   `@/lib/tts`, made in the client before any request is sent. Asking this
 *   route "how many segments?" for a short line would spend a Python process
 *   on a text that needs none — precisely the cost the roadmap's exit criterion
 *   forbids ("a single short line must not pay for long-script capability").
 *   The two thresholds are the same 600 in two languages on purpose, and
 *   `execution/check_segment_contract.py` fails the build if they ever drift.
 *
 * THE SCRIPT CONTRACT (read from execution/tts_trocear_guion.py, not guessed)
 *   With no positional argument and no `--archivo`, it reads the whole script
 *   from stdin. On success it prints exactly one JSON object:
 *     { "segments": [{ "index": int, "text": str,
 *                      "boundary": "sentence" | "paragraph", "chars": int }],
 *       "total_chars": int }
 *   `boundary` describes the END of that segment and is what later decides the
 *   pause the joiner inserts after it — 0,28 s after a sentence, 0,65 s after a
 *   paragraph. It is carried through untouched rather than recomputed here.
 *
 * WHY THE TEXT GOES OVER STDIN AND NOT AS AN ARGUMENT
 *   Two reasons, and the first is a hard limit. A Windows command line stops at
 *   32.767 characters and a thirty-minute narration runs to about 27.000 — the
 *   ceiling would be hit by exactly the scripts this feature exists for. The
 *   second is security: the script also accepts `--archivo <path>`, and that
 *   path must NEVER come from the browser, because the script would read
 *   whatever file it names. A pipe has no length limit and names no path at
 *   all, so neither problem can occur here.
 */

import { runScriptJson } from "@/lib/python";

export const dynamic = "force-dynamic";

/**
 * Cutting text is pure string work — no engine, no model, no audio. The only
 * real cost is starting the interpreter. Sized deliberately rather than
 * inheriting `runScript`'s 60s default, which was picked for a different job.
 */
const SPLIT_TIMEOUT_MS = 20_000;

/**
 * A ceiling on what one request may submit for cutting.
 *
 * The engine's own limit is time, not characters, but an unbounded body here
 * would let one request hand the segmenter an arbitrarily large string. Roughly
 * an hour and a half of narration at the rate this project measured, which is
 * far past any real script and far short of anything that strains the process.
 */
const MAX_SCRIPT_CHARS = 100_000;

const BOUNDARIES = ["sentence", "paragraph"] as const;
type Boundary = (typeof BOUNDARIES)[number];

type Segment = {
  index: number;
  text: string;
  boundary: Boundary;
  chars: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asBoundary(value: unknown): Boundary | null {
  return typeof value === "string" && (BOUNDARIES as readonly string[]).includes(value)
    ? (value as Boundary)
    : null;
}

/**
 * Validate the script's output rather than trusting its shape.
 *
 * The segmenter and this route are separate programs in separate languages;
 * "it printed JSON" is not the same as "it printed the JSON this route
 * promises the client". A malformed segment must surface as a 502 here, not as
 * an undefined field somewhere in the sequencer three steps later.
 */
function asSegment(value: unknown): Segment | null {
  const record = asRecord(value);
  if (!record) return null;

  const index = record.index;
  const text = record.text;
  const chars = record.chars;
  const boundary = asBoundary(record.boundary);

  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) return null;
  if (typeof text !== "string") return null;
  if (typeof chars !== "number" || !Number.isFinite(chars)) return null;
  if (!boundary) return null;

  return { index, text, boundary, chars };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const record = asRecord(body);
    const text = record && typeof record.text === "string" ? record.text : "";

    if (!text.trim()) {
      return Response.json(
        { error: "empty_text", message: "No hay texto que trocear." },
        { status: 400 },
      );
    }

    if (text.length > MAX_SCRIPT_CHARS) {
      return Response.json(
        {
          error: "text_too_long",
          message:
            `El guión tiene ${text.length} caracteres y el máximo por petición es ${MAX_SCRIPT_CHARS}.`,
        },
        { status: 400 },
      );
    }

    // No arguments: the script reads the whole body from stdin. See the header.
    const { data } = await runScriptJson<unknown>("tts_trocear_guion.py", [], {
      timeoutMs: SPLIT_TIMEOUT_MS,
      input: text,
    });

    const result = asRecord(data);
    const rawSegments = result && Array.isArray(result.segments) ? result.segments : null;
    const segments = rawSegments?.map(asSegment) ?? null;

    if (!segments || segments.length === 0 || segments.some((segment) => segment === null)) {
      return Response.json(
        {
          error: "split_bad_output",
          message: "El troceador no devolvió tramos entendibles.",
        },
        { status: 502 },
      );
    }

    const totalChars =
      result && typeof result.total_chars === "number" && Number.isFinite(result.total_chars)
        ? result.total_chars
        : segments.reduce((sum, segment) => sum + (segment as Segment).chars, 0);

    return Response.json({ segments, totalChars });
  } catch (cause) {
    // The script names no paths in this mode — it never opens a file — so
    // there is nothing to redact, unlike the verify and join routes.
    return Response.json(
      {
        error: "split_failed",
        message: cause instanceof Error ? cause.message : String(cause),
      },
      { status: 502 },
    );
  }
}
