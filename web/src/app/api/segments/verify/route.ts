/**
 * Does one segment's audio pass the loop-bug gate? Fase 3 (guiones largos),
 * ADR-007 § D4.
 *
 * WHY THIS EXISTS
 *   The engine has a known failure mode where a generation loops and comes
 *   back far longer than the text justifies. The skill this project ported
 *   the segmentation approach from caught it by comparing characters spoken
 *   against seconds produced (see `tts_narrar_largo.py`'s `CPS_MIN`/`CPS_MAX`,
 *   8.0–22.0 chars/second) and regenerating with another seed when a segment
 *   falls outside that band. This route is the deterministic half of that
 *   check for THIS app's segments: read the file the engine already wrote,
 *   measure it, answer with a verdict — the client (frontend-lead's
 *   sequencer) decides what to do with it (regenerate on "loop"/"cut", keep
 *   the segment on "ok"/"sin_veredicto").
 *
 * THE SCRIPT CONTRACT (execution/tts_unir_tramos.py — read from the real
 * script, not guessed; it landed mid-session while this route was written)
 *   Invoked as:
 *     tts_unir_tramos.py --verificar --audio <ruta absoluta> --caracteres <N>
 *   `--verificar`/`--unir` are a mutually exclusive, required argparse group
 *   — not subcommands. On success, prints exactly:
 *     { "chars": int, "seconds": float, "chars_per_second": float,
 *       "verdict": "ok" | "loop" | "cut" | "sin_veredicto" }
 *   Four verdicts, not a pass/fail boolean: "ok" and "sin_veredicto" both
 *   mean "keep this segment" (the latter is a segment shorter than
 *   `MIN_CHARS_PARA_VEREDICTO` — 20 chars today, explicitly UNCALIBRATED,
 *   same caveat as ADR-006's measured `TOKENS_PER_SECOND`), "loop" and "cut"
 *   both mean "regenerate with a different seed", for two different reasons
 *   (audio too long / too short for the text) the client may want to log
 *   separately.
 *
 *   On ANY failure (relative path, missing file, bad sample rate, etc — the
 *   script's own `main()` catches `RutaInvalidaError`, `FileNotFoundError`,
 *   `ValueError`, `OSError`, `RuntimeError`) it prints NOTHING to stdout,
 *   writes one line `ERROR: <message>` to stderr, and exits 1 — never a
 *   partial or malformed JSON object. That is exactly the shape
 *   `runScriptJson` already treats as "not parseable JSON": it rejects, and
 *   its message is that same `ERROR: ...` line (the LAST stderr line). This
 *   route's outer `catch` relays it as a 502 — never a guessed "verify_bad_output"
 *   shape for a failure the script actually described.
 *
 * ⚠️ RESPONSE SHAPE TO THE BROWSER IS A DRAFT. It is consumed by the client
 * sequencer (frontend-lead's page.tsx), which has not signed off on these
 * field names yet.
 */

import { outputFilePath, redactRoot, UnsafePathError } from "@/lib/comfy-files";
import { runScriptJson } from "@/lib/python";

export const dynamic = "force-dynamic";

/**
 * Reading one audio file's header/duration is fast — this is not a
 * generation call. Sized on purpose rather than inheriting `runScript`'s 60s
 * default, which was picked for a different job (see `python.ts`).
 */
const VERIFY_TIMEOUT_MS = 15_000;

const VERDICTS = ["ok", "loop", "cut", "sin_veredicto"] as const;
type Verdict = (typeof VERDICTS)[number];

type SegmentRef = { filename: string; subfolder: string; type: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asSegmentRef(value: unknown): SegmentRef | null {
  const record = asRecord(value);
  if (!record) return null;
  const filename = typeof record.filename === "string" ? record.filename : "";
  if (!filename) return null;
  return {
    filename,
    subfolder: typeof record.subfolder === "string" ? record.subfolder : "",
    // Same default as `outputFilePath` itself: absent means "an output".
    type: typeof record.type === "string" ? record.type : "output",
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asVerdict(value: unknown): Verdict | null {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value)
    ? (value as Verdict)
    : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const record = asRecord(body);

    const segment = asSegmentRef(record);
    if (!segment) {
      return Response.json(
        { error: "missing_segment", message: "Falta decir qué tramo verificar." },
        { status: 400 },
      );
    }

    const chars = record ? asFiniteNumber(record.chars) : null;
    if (chars === null || chars <= 0) {
      return Response.json(
        {
          error: "missing_chars",
          message: "Falta el número de caracteres del texto que produjo el tramo.",
        },
        { status: 400 },
      );
    }

    // The absolute path is resolved with the SAME function every delete and
    // status lookup in this app uses — never a raw path the client hands us.
    let absolutePath: string;
    try {
      absolutePath = outputFilePath(segment);
    } catch (cause) {
      const status = cause instanceof UnsafePathError ? 400 : 502;
      return Response.json(
        {
          error: "invalid_segment",
          message: cause instanceof Error ? cause.message : String(cause),
        },
        { status },
      );
    }

    const { data } = await runScriptJson<unknown>(
      "tts_unir_tramos.py",
      ["--verificar", "--audio", absolutePath, "--caracteres", String(Math.floor(chars))],
      { timeoutMs: VERIFY_TIMEOUT_MS },
    );

    const result = asRecord(data);
    const verdict = result ? asVerdict(result.verdict) : null;
    const seconds = result ? asFiniteNumber(result.seconds) : null;
    const charsPerSecond = result ? asFiniteNumber(result.chars_per_second) : null;

    if (!result || !verdict || seconds === null || charsPerSecond === null) {
      return Response.json(
        {
          error: "verify_bad_output",
          message: "El verificador no devolvió un resultado entendible.",
        },
        { status: 502 },
      );
    }

    return Response.json({ verdict, chars: Math.floor(chars), seconds, charsPerSecond });
  } catch (cause) {
    return Response.json(
      {
        // Redacted: the verifier names the file it failed on with its absolute
        // path, and this body reaches the browser. See `redactRoot`.
        error: "verify_failed",
        message: redactRoot(cause instanceof Error ? cause.message : String(cause)),
      },
      { status: 502 },
    );
  }
}
