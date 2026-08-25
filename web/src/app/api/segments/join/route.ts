/**
 * Join an ordered list of segments into one narration piece. Fase 3 (guiones
 * largos), ADR-007 § D3.
 *
 * The segments themselves are ordinary takes, already on disk via the
 * existing `submit()`/`statusOf()` path — nothing new writes them. What is
 * new is the JOINED file, written by `execution/tts_unir_tramos.py`'s
 * `unir()` at a path THIS route computes (`pieceOutputPath`, amending
 * ADR-004 — see its docstring in `comfy-files.ts` for why the invariant
 * survives).
 *
 * THE SCRIPT CONTRACT (execution/tts_unir_tramos.py — read from the real
 * script, not guessed; it landed mid-session while this route was written)
 *   Invoked as:
 *     tts_unir_tramos.py --unir --segmentos <JSON> --salida <ruta absoluta>
 *   `<JSON>` is a single argv element (never a shell string — `runScript`
 *   spawns without a shell, so no escaping hazard) shaped exactly as the
 *   script's own `unir()` consumes it, no translation layer in between:
 *     [{ "path": "<absolute>", "frontera": "sentence" | "paragraph" }, ...]
 *   `frontera` is the pause that follows THIS segment before the next one —
 *   short between sentences (0.28s), long between paragraphs (0.65s) — the
 *   LAST segment's is carried for shape symmetry only, unused by the script.
 *
 *   On success, prints exactly:
 *     { "output": str, "seconds": float, "samplerate": int, "segments_joined": int,
 *       "leveled": bool, "gains": float[] }
 *   `leveled`/`gains` were added 2026-08-24 with volume levelling between
 *   segments. This route does not forward them: it reads the fields it needs
 *   by name and ignores the rest, so the script can report more than the
 *   screen consumes.
 *   The sample rate is READ from the first segment, never assumed — a later
 *   segment at a different rate raises `FrecuenciasDistintasError` rather
 *   than being concatenated into a sped-up or corrupt piece.
 *
 *   On ANY failure (mismatched sample rates, a relative path either side, an
 *   empty segment list, an unknown `frontera`, a missing file) the script's
 *   `main()` catches it, prints NOTHING to stdout, writes one line
 *   `ERROR: <message>` to stderr, and exits 1. `runScriptJson` treats that
 *   exactly as "not parseable JSON": it rejects with that same message (the
 *   last stderr line). The outer `catch` below relays it as a 502 — the
 *   script's own message reaches the caller verbatim, including which
 *   segment and which two sample rates disagreed, without this route parsing
 *   or re-deriving any of it.
 *
 * ⚠️ REQUEST/RESPONSE SHAPE TO THE BROWSER IS A DRAFT, same caveat as
 * `/api/segments/verify`: the client sequencer (frontend-lead's page.tsx)
 * has not signed off on these field names yet.
 */

import { randomUUID } from "node:crypto";
import path from "node:path";

import { outputFilePath, pieceOutputPath, redactRoot, UnsafePathError } from "@/lib/comfy-files";
import { runScriptJson } from "@/lib/python";

export const dynamic = "force-dynamic";

/**
 * Decoding and concatenating N audio files is not the same job as reading one
 * header — it scales with the segment count, so the timeout does too, rather
 * than inheriting `runScript`'s 60s default (sized for a short text review,
 * not this). A fixed floor covers interpreter/model-loading startup; the
 * per-segment allowance is generous on purpose, since a timeout that fires on
 * a long-but-healthy join is worse than a slow failure surfacing late.
 */
/**
 * A hard ceiling on how many segments one request may join.
 *
 * WHY: the timeout below scales with the list, and the joiner decodes every
 * segment into memory before concatenating. Without a cap, a request with
 * 10.000 entries asks for an eleven-hour timeout while a Python process piles
 * up audio in RAM for all of it. 200 mirrors the history's own take ceiling:
 * a real narration is tens of segments, never hundreds.
 */
const MAX_SEGMENTS = 200;

/** No computed timeout may exceed this, whatever the segment count. */
const JOIN_TIMEOUT_CEILING_MS = 10 * 60_000;

const JOIN_TIMEOUT_BASE_MS = 15_000;
const JOIN_TIMEOUT_PER_SEGMENT_MS = 4_000;

type Boundary = "sentence" | "paragraph";

type SegmentInput = { filename: string; subfolder: string; type: string; boundary: Boundary };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asBoundary(value: unknown): Boundary | null {
  return value === "sentence" || value === "paragraph" ? value : null;
}

function asSegmentInput(value: unknown): SegmentInput | null {
  const record = asRecord(value);
  if (!record) return null;
  const filename = typeof record.filename === "string" ? record.filename : "";
  const boundary = asBoundary(record.boundary);
  if (!filename || !boundary) return null;
  return {
    filename,
    subfolder: typeof record.subfolder === "string" ? record.subfolder : "",
    type: typeof record.type === "string" ? record.type : "output",
    boundary,
  };
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    const record = asRecord(body);
    const rawSegments = record && Array.isArray(record.segments) ? record.segments : null;

    if (!rawSegments || rawSegments.length === 0) {
      return Response.json(
        { error: "missing_segments", message: "No hay tramos que unir." },
        { status: 400 },
      );
    }

    if (rawSegments.length > MAX_SEGMENTS) {
      return Response.json(
        {
          error: "too_many_segments",
          message:
            `Son ${rawSegments.length} tramos y el máximo por petición es ${MAX_SEGMENTS}.`,
        },
        { status: 400 },
      );
    }

    // Every path is resolved with the SAME function the delete/verify routes
    // use, and the WHOLE request is rejected the moment any one of them
    // fails to validate — never silently dropping a bad entry and joining
    // whatever was left, which would splice in the wrong audio without the
    // caller ever finding out.
    const resolved: { path: string; boundary: Boundary }[] = [];
    for (let i = 0; i < rawSegments.length; i += 1) {
      const input = asSegmentInput(rawSegments[i]);
      if (!input) {
        return Response.json(
          {
            error: "invalid_segment",
            message: `El tramo ${i + 1} no trae filename/boundary válidos.`,
          },
          { status: 400 },
        );
      }
      try {
        resolved.push({ path: outputFilePath(input), boundary: input.boundary });
      } catch (cause) {
        // outputFilePath only ever throws UnsafePathError — see comfy-files.ts.
        const message = cause instanceof Error ? cause.message : String(cause);
        return Response.json(
          {
            error: "invalid_segment",
            message: `El tramo ${i + 1} (${input.filename}) no es una ruta válida: ${message}`,
          },
          { status: 400 },
        );
      }
    }

    const id = randomUUID();
    let outputPath: string;
    try {
      outputPath = pieceOutputPath(id);
    } catch (cause) {
      const status = cause instanceof UnsafePathError ? 400 : 502;
      return Response.json(
        {
          error: "invalid_output",
          message: cause instanceof Error ? cause.message : String(cause),
        },
        { status },
      );
    }

    // Matches unir()'s tested parameter shape exactly — see the file
    // docstring — so no translation layer sits between this manifest and
    // what the Python function actually consumes.
    const manifest = resolved.map((segment) => ({
      path: segment.path,
      frontera: segment.boundary,
    }));

    const timeoutMs = Math.min(
      JOIN_TIMEOUT_BASE_MS + resolved.length * JOIN_TIMEOUT_PER_SEGMENT_MS,
      JOIN_TIMEOUT_CEILING_MS,
    );

    const { data } = await runScriptJson<unknown>(
      "tts_unir_tramos.py",
      ["--unir", "--segmentos", JSON.stringify(manifest), "--salida", outputPath],
      { timeoutMs },
    );

    const result = asRecord(data);
    const seconds = result ? asFiniteNumber(result.seconds) : null;
    const sampleRate = result ? asFiniteNumber(result.samplerate) : null;
    const segmentsJoined = result ? asFiniteNumber(result.segments_joined) : null;

    if (!result || seconds === null || sampleRate === null || segmentsJoined === null) {
      return Response.json(
        { error: "join_bad_output", message: "El unidor no devolvió un resultado entendible." },
        { status: 502 },
      );
    }

    const filename = path.basename(outputPath);
    // Same shape `statusOf()` already produces for a plain take's `audioUrl`,
    // so playback and download keep working through the routes that already
    // exist — nothing new to build on that side.
    const audioUrl = `/api/comfy/view?filename=${encodeURIComponent(filename)}&subfolder=${encodeURIComponent("")}&type=${encodeURIComponent("output")}`;

    return Response.json({
      ok: true,
      id,
      filename,
      audioUrl,
      seconds,
      sampleRate,
      segments: segmentsJoined,
    });
  } catch (cause) {
    // Reached both by a genuine crash AND by `unir()`'s own rejections
    // (mismatched sample rates, etc — see the file docstring): both surface
    // here as "stdout was not valid JSON", and the message is the Python
    // exception's own text, not a generic failure.
    return Response.json(
      {
        // Redacted: the joiner names the file it failed on with its absolute
        // path, and this body reaches the browser. See `redactRoot`.
        error: "join_failed",
        message: redactRoot(cause instanceof Error ? cause.message : String(cause)),
      },
      { status: 502 },
    );
  }
}
