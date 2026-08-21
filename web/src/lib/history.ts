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

export type Take = {
  id: string;
  text: string;
  voiceId: string;
  voiceLabel: string;
  seed: number;
  audioUrl: string;
  filename: string;
  createdAt: number;
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
 * Forget a take AND delete its audio from ComfyUI's output directory.
 *
 * Two halves that must both happen: the entry lives here in the browser, the
 * .flac lives on disk, and leaving either behind is the wrong outcome — an
 * orphan file nothing references, or an entry pointing at nothing.
 *
 * The disk delete goes first. If it fails, the entry stays, so the user can see
 * what happened and try again; dropping the row first would lose the only
 * handle to the file.
 *
 * ⚠️ Irreversible. The audio is not regenerable — the same text with the same
 * seed produces the same take, but only while the voice still exists.
 */
export async function deleteTake(take: Take): Promise<void> {
  const url = new URL(take.audioUrl, window.location.origin);
  const filename = url.searchParams.get("filename");

  if (filename) {
    const params = new URLSearchParams({
      filename,
      subfolder: url.searchParams.get("subfolder") ?? "",
      type: url.searchParams.get("type") ?? "output",
    });
    const res = await fetch(`/api/takes?${params}`, { method: "DELETE" });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.message ?? "No se pudo borrar el archivo de audio.");
    }
  }

  commit(getSnapshot().filter((t) => t.id !== take.id));
}
