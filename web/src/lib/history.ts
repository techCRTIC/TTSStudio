"use client";

import { useSyncExternalStore } from "react";

/**
 * The history of takes, as a tiny external store.
 *
 * It is persisted in localStorage because this is a single-user local app: a
 * database would be ceremony, since nothing is shared, nothing is queried, and
 * the browser profile IS the account.
 *
 * The audio itself is NOT copied here — it lives in ComfyUI's output folder and
 * is referenced by URL. Duplicating it would double the disk for nothing.
 *
 * It is an external store rather than component state so that reading
 * localStorage after mount does not mean a setState inside an effect, and so
 * that the server render and the first client render agree on an empty list.
 */

/**
 * One segment of a long-script take, as little as it takes to redo it or
 * delete it. Fase 3 (guiones largos).
 *
 * `subfolder` and `type` are NOT stored: every generation in this app writes
 * to the same defaults ("" and "output" — see `SaveAudio`'s node config in
 * `buildWorkflow`), so storing a constant that already holds everywhere would
 * be repeating it 200 takes over for nothing. The segment's TEXT isn't stored
 * either — it is derivable by re-running `/api/segments/split` on the take's
 * own `text` and reading position `index`, and a long take's `text` is the
 * one thing that already has to be kept in full (it is what recall() puts
 * back in the script field).
 */
export type TakeSegment = {
  index: number;
  filename: string;
  boundary: "sentence" | "paragraph";
  /**
   * The seed actually used for THIS segment — possibly a retry seed, and not
   * necessarily equal to the take's own `seed` (the base seed the whole
   * script started from). This is what makes one segment reproducible on its
   * own, same reasoning as the take-level `seed` field below.
   */
  seed: number;
};

export type Take = {
  id: string;
  text: string;
  voiceId: string;
  voiceLabel: string;
  seed: number;
  audioUrl: string;
  filename: string;
  createdAt: number;
  /**
   * Marked by the user as one that came out well.
   *
   * ⚠️ It is a JUDGEMENT, and it is the only one in this file. Everything else
   * a take stores is a fact the app knows on its own — the text, the voice, the
   * seed, the file. Whether it SOUNDS good is something only a person can say,
   * and until they say it the history knows what was generated and nothing
   * about what was worth keeping.
   *
   * Optional because takes written before this existed have no answer, and
   * "unmarked" must not read as "bad".
   */
  good?: boolean;
  /**
   * Present only for a take assembled from a long script's segments. Fase 3
   * (guiones largos) — same precedent as `good?` above: takes written before
   * this existed have no answer, and their absence must not be treated as
   * "this take has zero segments" (a real, different state) — it means "this
   * take predates the concept", and `filesForTake`/`deleteTake` below both
   * read it that way, falling back to the single-file take they always were.
   */
  segments?: TakeSegment[];
};

const KEY = "ttsstudio.history.v1";
const LIMIT = 200;

const EMPTY: Take[] = [];

let cache: Take[] | null = null;
const listeners = new Set<() => void>();

function read(): Take[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Take[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/**
 * The snapshot must be referentially stable between renders or React loops, so
 * the parsed array is cached and only replaced when the data really changes.
 */
function getSnapshot(): Take[] {
  if (cache === null) cache = read();
  return cache;
}

function getServerSnapshot(): Take[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: Take[]): void {
  cache = next.slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // A full quota must never cost the user the take they just made: the
    // in-memory history stands even when the write fails.
  }
  listeners.forEach((l) => l());
}

export function useHistory(): Take[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function addTake(take: Take): void {
  commit([take, ...getSnapshot()]);
}

/**
 * Mark a take as one that came out well, or take the mark back.
 *
 * Deliberately a toggle with no middle state: "good" and "not said" are the
 * only two things a person actually knows after listening once. A rating scale
 * would ask for a precision nobody has and would go unused.
 */
export function toggleGood(id: string): void {
  commit(getSnapshot().map((t) => (t.id === id ? { ...t, good: !t.good } : t)));
}

/**
 * Read `filename`/`subfolder`/`type` back out of a `/api/comfy/view` URL.
 *
 * A fixed dummy origin, never `window.location.origin`: this is a parse of a
 * relative URL's own query string, and needing a browser for that would make
 * `filesForTake` — a function this file wants pure and testable on its own —
 * unable to run under `node:test` with nothing mounted.
 */
function parseAudioRef(audioUrl: string): { filename: string; subfolder: string; type: string } {
  const url = new URL(audioUrl, "http://localhost");
  return {
    filename: url.searchParams.get("filename") ?? "",
    subfolder: url.searchParams.get("subfolder") ?? "",
    type: url.searchParams.get("type") ?? "output",
  };
}

/**
 * Every file on disk that belongs to this take.
 *
 * A normal take (no `segments`, including every take written before Fase 3)
 * is exactly the one file its `audioUrl` names. A long-script take is its N
 * segment files PLUS the joined piece `audioUrl` points at — N+1 files, not
 * N, because the join does not overwrite or reuse a segment's file. Segments
 * default to `subfolder: ""`/`type: "output"`, same defaults every generation
 * in this app writes to (see `TakeSegment`'s own docstring).
 */
export function filesForTake(take: Take): { filename: string; subfolder: string; type: string }[] {
  const piece = parseAudioRef(take.audioUrl);
  if (!take.segments || take.segments.length === 0) return [piece];
  const segmentFiles = take.segments.map((s) => ({
    filename: s.filename,
    subfolder: "",
    type: "output",
  }));
  return [...segmentFiles, piece];
}

/**
 * Forget a take AND delete its audio from ComfyUI's output directory.
 *
 * Two halves that must both happen: the entry lives here in the browser, the
 * .flac (or .flacs, for a long-script take) live on disk, and leaving either
 * behind is the wrong outcome — an orphan file nothing references, or an
 * entry pointing at nothing.
 *
 * The disk delete goes first, for BOTH shapes below. If it fails — wholly or
 * partially — the entry stays, so the user can see what happened and try
 * again; dropping the row first would lose the only handle to the file(s).
 *
 * A normal take (no `segments`) deletes exactly as it always has: one query-
 * param DELETE to `/api/takes`. A long-script take deletes its N segments
 * plus the joined piece in ONE batched request (`DELETE /api/takes` with a
 * JSON body) rather than N+1 round trips — see that route's own docstring for
 * the batch contract. A partial failure there is surfaced with the names of
 * whichever files did not delete, not swallowed as a plain success.
 *
 * ⚠️ Irreversible. The audio is not regenerable — the same text with the same
 * seed produces the same take, but only while the voice still exists.
 */
export async function deleteTake(take: Take): Promise<void> {
  if (take.segments && take.segments.length > 0) {
    await deleteTakeBatch(take);
  } else {
    await deleteTakeSingle(take);
  }
  commit(getSnapshot().filter((t) => t.id !== take.id));
}

async function deleteTakeSingle(take: Take): Promise<void> {
  const ref = parseAudioRef(take.audioUrl);
  if (!ref.filename) return;

  const params = new URLSearchParams(ref);
  const res = await fetch(`/api/takes?${params}`, { method: "DELETE" });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new Error(payload?.message ?? "No se pudo borrar el archivo de audio.");
  }
}

async function deleteTakeBatch(take: Take): Promise<void> {
  const files = filesForTake(take);
  const res = await fetch("/api/takes", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files }),
  });
  const payload = (await res.json().catch(() => null)) as
    | { message?: string; results?: { filename: string; deleted: boolean }[] }
    | null;

  if (!res.ok) {
    throw new Error(payload?.message ?? "No se pudieron borrar los tramos de esta toma.");
  }

  // 200 vs 207 already tells the route's own caller whether everything went;
  // reading `results` here instead of trusting the status code is what lets a
  // partial failure name WHICH files survived, not just that something did.
  const failed = (payload?.results ?? []).filter((r) => !r.deleted);
  if (failed.length > 0) {
    const names = failed.map((r) => r.filename).join(", ");
    throw new Error(`No se pudieron borrar ${failed.length} de los archivos de esta toma: ${names}.`);
  }
}
