"use client";

import { useCallback, useRef, useState } from "react";
import { randomSeed, SEGMENT_MAX_CHARS, type Language } from "./tts.ts";

/**
 * The long-script sequencer. Fase 3 (guiones largos).
 *
 * WHAT THIS FILE DOES AND DOES NOT DO
 *   It walks a script through the same engine `page.tsx`'s `generate()` already
 *   talks to — POST /api/generate, then poll GET /api/status/:promptId every
 *   `STATUS_POLL_MS` — never a second path to ComfyUI. What it adds is the
 *   decision of whether one call is enough, and if not, the cutting
 *   (`/api/segments/split`), the per-segment loop-bug gate
 *   (`/api/segments/verify`), and the final assembly (`/api/segments/join`).
 *
 * WHY THE PURE FUNCTIONS ARE EXPORTED SEPARATELY FROM THE HOOK
 *   `useLongScript` is what a component mounts, but every decision it makes —
 *   short vs. long, one segment's generate-verify-retry cycle, the in-order
 *   walk across all of them — is a plain async function with no React in it.
 *   That is what lets the whole sequencer be tested with `node:test` and a
 *   `fetch` spy, without mounting anything.
 *
 * THE SHORT-TEXT GUARANTEE
 *   `beginGeneration` is the single entry point for both paths, and for a
 *   short text (`text.length <= SEGMENT_MAX_CHARS`) it does exactly what
 *   `page.tsx` does today: one POST to /api/generate, one polling loop. It
 *   never calls `/api/segments/split` for that text — asking the segmenter
 *   "how many segments would this be" for a text that needs none is precisely
 *   the extra process the roadmap's exit criterion forbids (see
 *   `SEGMENT_MAX_CHARS`'s own docstring in `./tts.ts`).
 */

/**
 * How many times a segment may be regenerated with a different seed before
 * the whole script stops rather than shipping a bad segment silently.
 *
 * 3 — the original generation plus up to 2 retries. Kept small on purpose:
 * the loop/cut failure this gate exists for is a property of the TEXT×SEED
 * pair, not something that gets luckier the more times it's rolled — the
 * ported skill this segmentation approach comes from treats a segment that
 * fails twice in a row as one that needs a human, not a fourth roll of the
 * dice. Stopping and naming the culprit beats a silent, unbounded retry loop:
 * a bad piece shipped quietly is the one outcome this feature must never
 * produce.
 */
export const MAX_SEGMENT_ATTEMPTS = 3;

/** Same cadence `page.tsx`'s own polling `setInterval` uses today. */
export const STATUS_POLL_MS = 700;

export type SegmentBoundary = "sentence" | "paragraph";

/** One cut of the script, as `/api/segments/split` returns it. */
export type ScriptSegment = {
  index: number;
  text: string;
  boundary: SegmentBoundary;
  chars: number;
};

export type SegmentTrackStatus = "pending" | "generating" | "done" | "redone" | "failed";

/**
 * One segment's progress, as the interface would show it: "tramo K de N" is
 * `index`/(array length), and `status` is exactly the five states a person
 * needs to see — pendiente, generando, hecho, rehecho (retried with another
 * seed), fallado. `seed` is the EFFECTIVE seed this segment actually rendered
 * with, once it has one — the only thing that makes a single segment
 * reproducible on its own.
 */
export type SegmentTrack = {
  index: number;
  text: string;
  boundary: SegmentBoundary;
  chars: number;
  status: SegmentTrackStatus;
  seed: number | null;
  attempts: number;
  filename: string | null;
  subfolder: string;
  type: string;
  audioUrl: string | null;
  error?: string;
};

/**
 * The only two things the engine can honestly say while it works.
 *
 * There is no percentage and no estimate anywhere in this project because the
 * engine does not know either one — `StatusLine` has refused to draw a bar
 * since Fase 1 for exactly this reason, and `PRODUCT.md` forbids inventing
 * latency figures that do not exist for this app.
 */
export type EngineReport =
  | { kind: "queued"; position: number | null }
  | { kind: "running" };

export type GenerateOptions = {
  language?: Language;
  maxNewTokens?: number;
  /**
   * Called on every poll with what the engine just said.
   *
   * WHY IT EXISTS: without it the engine's state dies inside `generateOne`,
   * and a screen watching a twelve-segment script could only ever say
   * "working" — losing the queue position that the short path has shown since
   * Fase 1. The confirmed design for the strip is "tramo K de N" PLUS this,
   * so this is the channel that carries the second half.
   */
  onStatus?: (report: EngineReport) => void;
  /**
   * Overridable so tests never sleep for real. Production leaves this at its
   * default, which is a real `setTimeout` at `STATUS_POLL_MS`.
   */
  wait?: (ms: number) => Promise<void>;
};

const defaultWait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Read `filename`/`subfolder`/`type` back out of a `/api/comfy/view` URL —
 * the same shape `statusOf()` produces for `audioUrl`. The base is a fixed
 * dummy origin, never `window.location`: this function has no business
 * needing a browser to parse a relative URL's own query string, and that is
 * what lets it run under `node:test` with nothing mounted.
 */
function parseAudioRef(audioUrl: string): { filename: string; subfolder: string; type: string } {
  const url = new URL(audioUrl, "http://localhost");
  return {
    filename: url.searchParams.get("filename") ?? "",
    subfolder: url.searchParams.get("subfolder") ?? "",
    type: url.searchParams.get("type") ?? "output",
  };
}

export type GeneratedAudio = {
  seed: number;
  audioUrl: string;
  filename: string;
  subfolder: string;
  type: string;
};

/**
 * One generation, start to finish — the exact mechanic `page.tsx`'s
 * `generate()` already runs: POST /api/generate, then poll GET
 * /api/status/:promptId until the engine says done, finished (no audio), or
 * failed. This is the ONLY function in this file that talks to the engine;
 * everything else is built on top of it.
 */
export async function generateOne(
  text: string,
  voiceId: string,
  seed: number | null,
  options: GenerateOptions = {},
): Promise<GeneratedAudio> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId,
      seed,
      language: options.language,
      maxNewTokens: options.maxNewTokens,
    }),
  });
  const submitted = (await res.json().catch(() => null)) as
    | { promptId?: string; seed?: number; message?: string }
    | null;
  if (!res.ok || !submitted?.promptId || typeof submitted.seed !== "number") {
    throw new Error(submitted?.message ?? "No se pudo enviar la generación.");
  }
  const { promptId, seed: effectiveSeed } = submitted;

  const wait = options.wait ?? defaultWait;
  for (;;) {
    const status = (await fetch("/api/status/" + promptId)
      .then((r) => r.json())
      .catch(() => null)) as
      | { state?: string; audioUrl?: string; message?: string }
      | null;

    if (status?.state === "done" && status.audioUrl) {
      return { seed: effectiveSeed, audioUrl: status.audioUrl, ...parseAudioRef(status.audioUrl) };
    }
    if (status?.state === "finished") {
      throw new Error("El motor terminó pero no devolvió audio.");
    }
    if (status?.state === "failed") {
      throw new Error(status.message ?? "La generación falló.");
    }
    if (options.onStatus) {
      if (status?.state === "queued") {
        const raw = (status as { position?: unknown }).position;
        options.onStatus({ kind: "queued", position: typeof raw === "number" ? raw : null });
      } else if (status?.state === "running") {
        options.onStatus({ kind: "running" });
      }
    }
    await wait(STATUS_POLL_MS);
  }
}

export type SplitResult = { segments: ScriptSegment[]; totalChars: number };

/** POST /api/segments/split. See that route's own docstring for the contract. */
export async function splitScript(text: string): Promise<SplitResult> {
  const res = await fetch("/api/segments/split", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json().catch(() => null)) as
    | (SplitResult & { message?: string })
    | null;
  if (!res.ok || !body?.segments) {
    throw new Error(body?.message ?? "No se pudo trocear el guión.");
  }
  return { segments: body.segments, totalChars: body.totalChars };
}

export type Verdict = "ok" | "loop" | "cut" | "sin_veredicto";

export type VerifyResult = {
  verdict: Verdict;
  chars: number;
  seconds: number;
  charsPerSecond: number;
};

type AudioRef = { filename: string; subfolder: string; type: string };

/** POST /api/segments/verify. 'ok'/'sin_veredicto' keep the segment; 'loop'/'cut' redo it. */
export async function verifySegment(ref: AudioRef, chars: number): Promise<VerifyResult> {
  const res = await fetch("/api/segments/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...ref, chars }),
  });
  const body = (await res.json().catch(() => null)) as (VerifyResult & { message?: string }) | null;
  if (!res.ok || !body?.verdict) {
    throw new Error(body?.message ?? "No se pudo verificar el tramo.");
  }
  return body;
}

function keepsSegment(verdict: Verdict): boolean {
  return verdict === "ok" || verdict === "sin_veredicto";
}

export type JoinInput = AudioRef & { boundary: SegmentBoundary };

export type JoinResult = {
  ok: true;
  id: string;
  filename: string;
  audioUrl: string;
  seconds: number;
  sampleRate: number;
  segments: number;
};

/** POST /api/segments/join. `list` must already be in the final playback order. */
export async function joinSegments(list: JoinInput[]): Promise<JoinResult> {
  const res = await fetch("/api/segments/join", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ segments: list }),
  });
  const body = (await res.json().catch(() => null)) as (JoinResult & { message?: string }) | null;
  if (!res.ok || !body?.ok) {
    throw new Error(body?.message ?? "No se pudo unir los tramos.");
  }
  return body;
}

/**
 * A seed guaranteed to differ from every one already tried for this segment.
 * Collision odds against `randomSeed()`'s ~2^31 range are astronomical, but a
 * retry that landed on the very seed that just failed would defeat the point
 * of retrying, so it is checked rather than assumed.
 */
function pickRetrySeed(tried: ReadonlySet<number>): number {
  let seed = randomSeed();
  while (tried.has(seed)) seed = randomSeed();
  return seed;
}

function pendingTrack(segment: ScriptSegment, status: SegmentTrackStatus): SegmentTrack {
  return {
    index: segment.index,
    text: segment.text,
    boundary: segment.boundary,
    chars: segment.chars,
    status,
    seed: null,
    attempts: 0,
    filename: null,
    subfolder: "",
    type: "output",
    audioUrl: null,
  };
}

export type SegmentAttemptResult = { ok: boolean; track: SegmentTrack };

/**
 * One segment, generated and verified, retried with a fresh seed on 'loop' or
 * 'cut' up to `MAX_SEGMENT_ATTEMPTS` times. The base seed is used for the
 * FIRST attempt only — every retry after that draws a new one, and the
 * effective seed of whichever attempt succeeds is what the track records.
 *
 * Exhausting every attempt returns `ok: false` with a track named `"failed"`
 * and an `error` naming this segment — the caller (`runSegmentsInOrder`) is
 * what turns that into "the whole script stops here".
 */
export async function generateSegment(
  segment: ScriptSegment,
  voiceId: string,
  baseSeed: number,
  options: GenerateOptions = {},
): Promise<SegmentAttemptResult> {
  let seed = baseSeed;
  const tried = new Set<number>();
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_SEGMENT_ATTEMPTS; attempt += 1) {
    tried.add(seed);
    try {
      const generated = await generateOne(segment.text, voiceId, seed, options);
      const verdict = await verifySegment(
        { filename: generated.filename, subfolder: generated.subfolder, type: generated.type },
        segment.chars,
      );
      if (keepsSegment(verdict.verdict)) {
        return {
          ok: true,
          track: {
            ...pendingTrack(segment, attempt === 1 ? "done" : "redone"),
            seed: generated.seed,
            attempts: attempt,
            filename: generated.filename,
            subfolder: generated.subfolder,
            type: generated.type,
            audioUrl: generated.audioUrl,
          },
        };
      }
      lastError = `El tramo ${segment.index + 1} salió con veredicto "${verdict.verdict}".`;
    } catch (cause) {
      lastError = messageOf(cause);
    }
    seed = pickRetrySeed(tried);
  }

  return {
    ok: false,
    track: {
      ...pendingTrack(segment, "failed"),
      attempts: MAX_SEGMENT_ATTEMPTS,
      error: lastError || `El tramo ${segment.index + 1} no se pudo generar.`,
    },
  };
}

export type RunResult =
  | { ok: true; tracks: SegmentTrack[] }
  | {
      ok: false;
      tracks: SegmentTrack[];
      failedIndex: number;
      error: string;
      /**
       * The user asked to stop. NOT a failure: the segments already done are
       * good, and the caller joins them into a partial piece rather than
       * throwing them away. Optional so the existing failure shape is
       * unchanged for every caller that never stops anything.
       */
      stopped?: boolean;
    };

/**
 * Every segment, in order, one at a time — never in parallel, and never past
 * the first one that exhausts its retries. `onTrack` fires with a
 * `"generating"` track the moment a segment starts and again with its final
 * track once it settles, which is what lets the interface say "tramo K de N"
 * live without this function knowing anything about React.
 */
export async function runSegmentsInOrder(
  segments: ScriptSegment[],
  voiceId: string,
  baseSeed: number,
  options: GenerateOptions = {},
  onTrack?: (track: SegmentTrack) => void,
  /**
   * Asked BETWEEN segments, never during one. Stopping mid-generation would
   * abandon a job already queued in ComfyUI, which keeps running and keeps
   * holding the GPU — the app would look stopped while the engine was not.
   * The cost of the honest version is one segment of latency.
   */
  shouldStop?: () => boolean,
): Promise<RunResult> {
  const tracks: SegmentTrack[] = [];
  for (const segment of segments) {
    if (shouldStop?.()) {
      return {
        ok: false,
        stopped: true,
        tracks,
        failedIndex: segment.index,
        error: "Detenido.",
      };
    }
    onTrack?.(pendingTrack(segment, "generating"));
    const result = await generateSegment(segment, voiceId, baseSeed, options);
    tracks.push(result.track);
    onTrack?.(result.track);
    if (!result.ok) {
      return {
        ok: false,
        tracks,
        failedIndex: segment.index,
        error: result.track.error ?? `El tramo ${segment.index + 1} falló.`,
      };
    }
  }
  return { ok: true, tracks };
}

/**
 * Redo ONE segment on its own: exactly one call to /api/generate, plus the
 * same verify check every segment gets — never the retry loop
 * `generateSegment` runs. This is the user asking for "try this one again",
 * not the automatic gate, and it must never cascade into anything else: the
 * caller supplies the segment and the seed, nothing else is read or touched.
 */
export async function redoSegment(
  segment: ScriptSegment,
  voiceId: string,
  seed: number,
  options: GenerateOptions = {},
): Promise<SegmentTrack> {
  const generated = await generateOne(segment.text, voiceId, seed, options);
  let verdict: Verdict | null = null;
  try {
    const result = await verifySegment(
      { filename: generated.filename, subfolder: generated.subfolder, type: generated.type },
      segment.chars,
    );
    verdict = result.verdict;
  } catch {
    // Verification failing here does not undo the generation that already
    // succeeded — the audio exists. The track is left as "redone" rather than
    // guessed as bad.
    verdict = null;
  }
  const bad = verdict !== null && !keepsSegment(verdict);
  return {
    ...pendingTrack(segment, bad ? "failed" : "redone"),
    seed: generated.seed,
    attempts: 1,
    filename: generated.filename,
    subfolder: generated.subfolder,
    type: generated.type,
    audioUrl: generated.audioUrl,
    error: bad ? `El tramo ${segment.index + 1} volvió a salir con veredicto "${verdict}".` : undefined,
  };
}

/** Whether a text needs cutting at all — never call `splitScript` without checking this first. */
export function needsSegmentation(text: string): boolean {
  return text.length > SEGMENT_MAX_CHARS;
}

export type BeginOutcome =
  | { kind: "single"; result: GeneratedAudio }
  | { kind: "split"; segments: ScriptSegment[]; totalChars: number };

/**
 * The single entry point for both paths. A short text runs exactly one
 * generation — nothing more is ever called for it. A long text is cut into
 * segments and handed back for confirmation; nothing is generated yet, on
 * purpose (see `runSegmentsInOrder`, which only runs once the user confirms).
 */
export async function beginGeneration(
  text: string,
  voiceId: string,
  seed: number | null,
  options: GenerateOptions = {},
): Promise<BeginOutcome> {
  if (!needsSegmentation(text)) {
    const result = await generateOne(text, voiceId, seed, options);
    return { kind: "single", result };
  }
  const { segments, totalChars } = await splitScript(text);
  return { kind: "split", segments, totalChars };
}

export type LongScriptPhase =
  | "idle"
  | "splitting"
  | "confirming"
  | "generating"
  | "stopping"
  | "joining"
  | "done"
  | "failed";

export type LongScriptResult =
  | { kind: "single"; result: GeneratedAudio }
  | { kind: "joined"; result: JoinResult };

export type LongScriptState = {
  phase: LongScriptPhase;
  /**
   * What the engine last said about whatever it is working on RIGHT NOW.
   *
   * Deliberately not tagged with a segment index: the index is already knowable
   * from `tracks` (exactly one is "generating" at a time, because the walk is
   * strictly in order). Carrying it twice would let the two drift apart and
   * show a queue position against the wrong tramo.
   */
  engine: EngineReport | null;
  segments: ScriptSegment[];
  totalChars: number;
  tracks: SegmentTrack[];
  result: LongScriptResult | null;
  failedIndex: number | null;
  error: string | null;
  /**
   * The run was stopped on purpose and the piece holds only the segments that
   * were finished. Separate from `error` because this is not a failure — but
   * the screen must never present a partial piece as if it were the whole
   * script.
   */
  partial: boolean;
};

const INITIAL_STATE: LongScriptState = {
  phase: "idle",
  engine: null,
  segments: [],
  totalChars: 0,
  tracks: [],
  result: null,
  failedIndex: null,
  error: null,
  partial: false,
};

/**
 * Swap one track for its new version, leaving every sibling untouched.
 *
 * EXPORTED FOR ITS TEST, and the test is the point. `redoSegment` proves that
 * redoing one segment costs exactly one generation — but it takes a single
 * segment and cannot see its siblings, so it can never prove the other half of
 * that promise: that the other eleven keep their file and their seed. This
 * function is where that half actually lives, so this is where it is asserted.
 *
 * "Untouched" is meant literally: the siblings come back as the SAME OBJECTS,
 * and the array handed in is never mutated.
 */
export function replaceTrack(tracks: SegmentTrack[], next: SegmentTrack): SegmentTrack[] {
  const rest = tracks.filter((t) => t.index !== next.index);
  rest.push(next);
  rest.sort((a, b) => a.index - b.index);
  return rest;
}

/**
 * The stateful wrapper a component mounts. Every decision it makes is one of
 * the pure functions above — this hook only turns their results into state a
 * screen can render: `phase`, the `tracks` array ("tramo K de N" is
 * `index`/`segments.length`), and whichever `result` the run produced.
 */
export function useLongScript(): {
  state: LongScriptState;
  begin: (text: string, voiceId: string, seed: number | null, options?: GenerateOptions) => void;
  confirm: (voiceId: string, baseSeed: number, options?: GenerateOptions) => void;
  redo: (index: number, voiceId: string, options?: GenerateOptions) => void;
  stop: () => void;
  reset: () => void;
} {
  const [state, setState] = useState<LongScriptState>(INITIAL_STATE);
  /**
   * A ref and not state: the running loop closes over its own render, so a
   * state variable would be read at its stale value forever. The ref is the
   * one box both the loop and the button can see.
   */
  const stopRequested = useRef(false);

  const begin = useCallback(
    (text: string, voiceId: string, seed: number | null, options: GenerateOptions = {}) => {
      if (!text.trim() || !voiceId) return;

      setState({ ...INITIAL_STATE, phase: needsSegmentation(text) ? "splitting" : "generating" });

      void (async () => {
        try {
          const outcome = await beginGeneration(text, voiceId, seed, options);
          if (outcome.kind === "single") {
            setState((prev) => ({
              ...prev,
              phase: "done",
              result: { kind: "single", result: outcome.result },
            }));
          } else {
            setState((prev) => ({
              ...prev,
              phase: "confirming",
              segments: outcome.segments,
              totalChars: outcome.totalChars,
            }));
          }
        } catch (cause) {
          setState((prev) => ({ ...prev, phase: "failed", error: messageOf(cause) }));
        }
      })();
    },
    [],
  );

  const confirm = useCallback(
    (voiceId: string, baseSeed: number, options: GenerateOptions = {}) => {
      const segments = state.segments;
      if (state.phase !== "confirming" || segments.length === 0) return;

      setState((prev) => ({ ...prev, phase: "generating", tracks: [] }));

      // The caller's options are extended, not replaced: whatever `onStatus`
      // it passed still fires, and the hook's own listener is what keeps
      // `state.engine` current for the screen.
      const watched: GenerateOptions = {
        ...options,
        onStatus: (report) => {
          options.onStatus?.(report);
          setState((prev) => ({ ...prev, engine: report }));
        },
      };

      stopRequested.current = false;

      void (async () => {
        const result = await runSegmentsInOrder(
          segments,
          voiceId,
          baseSeed,
          watched,
          (track) => {
            setState((prev) => ({ ...prev, tracks: replaceTrack(prev.tracks, track) }));
          },
          () => stopRequested.current,
        );

        const stopped = !result.ok && result.stopped === true;
        const usable = result.tracks.filter((t) => t.filename !== null);

        // A stop is not a failure. What was generated is good audio, so it gets
        // joined into a partial piece — the user's call (2026-08-24). Only a
        // real failure throws the run away.
        if (!result.ok && !stopped) {
          setState((prev) => ({
            ...prev,
            phase: "failed",
            tracks: result.tracks,
            failedIndex: result.failedIndex,
            error: result.error,
          }));
          return;
        }

        // Stopped before a single segment finished: there is nothing to join,
        // so the cut goes back on screen ready to be run again.
        if (stopped && usable.length === 0) {
          setState((prev) => ({ ...prev, phase: "confirming", tracks: [], engine: null }));
          return;
        }

        const toJoin = stopped ? usable : result.tracks;
        setState((prev) => ({ ...prev, phase: "joining", tracks: result.tracks }));
        try {
          const piece = await joinSegments(
            toJoin.map((t) => ({
              filename: t.filename ?? "",
              subfolder: t.subfolder,
              type: t.type,
              boundary: t.boundary,
            })),
          );
          setState((prev) => ({
            ...prev,
            phase: "done",
            partial: stopped,
            result: { kind: "joined", result: piece },
          }));
        } catch (cause) {
          setState((prev) => ({ ...prev, phase: "failed", error: messageOf(cause) }));
        }
      })();
    },
    [state.phase, state.segments],
  );

  const redo = useCallback(
    (index: number, voiceId: string, options: GenerateOptions = {}) => {
      const segment = state.segments[index];
      if (!segment) return;
      const previous = state.tracks.find((t) => t.index === index);
      const avoid = new Set<number>(previous?.seed != null ? [previous.seed] : []);
      const seed = pickRetrySeed(avoid);

      setState((prev) => ({ ...prev, tracks: replaceTrack(prev.tracks, pendingTrack(segment, "generating")) }));

      void (async () => {
        try {
          const track = await redoSegment(segment, voiceId, seed, options);
          setState((prev) => ({ ...prev, tracks: replaceTrack(prev.tracks, track) }));
        } catch (cause) {
          setState((prev) => ({
            ...prev,
            tracks: replaceTrack(prev.tracks, {
              ...pendingTrack(segment, "failed"),
              attempts: 1,
              error: messageOf(cause),
            }),
          }));
        }
      })();
    },
    [state.segments, state.tracks],
  );

  /**
   * Stop after the segment in flight. It does NOT abort that generation: the
   * job is already queued in ComfyUI and cancelling here would only hide it,
   * not stop it. "stopping" is a phase of its own so the screen can say the
   * truth — that it is finishing one segment before it stops.
   */
  const stop = useCallback(() => {
    stopRequested.current = true;
    setState((prev) => (prev.phase === "generating" ? { ...prev, phase: "stopping" } : prev));
  }, []);

  const reset = useCallback(() => {
    stopRequested.current = false;
    setState(INITIAL_STATE);
  }, []);

  return { state, begin, confirm, redo, stop, reset };
}
