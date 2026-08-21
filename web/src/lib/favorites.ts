"use client";

import { useSyncExternalStore } from "react";

/**
 * Saved seeds.
 *
 * A seed is the one lever that makes a delivery repeatable: same text, same
 * voice, same seed, same take. So when a generation lands well, the seed is
 * worth keeping — and worth keeping WITH A NAME, because a bare 1743920118
 * tells you nothing three days later.
 *
 * ⚠️ What a saved seed does NOT promise: that the same seed carries the same
 * "character" across DIFFERENT texts. That would make saved seeds far more
 * valuable, and it is plausible, but it has not been measured on this engine —
 * so the interface does not claim it. It claims only what is certain:
 * reproducibility of one take.
 *
 * Same store shape as ./history and for the same reasons: localStorage because
 * the browser profile is the account, external store so reading it after mount
 * is not a setState inside an effect.
 */

export type SavedSeed = {
  seed: number;
  /** What the user calls it — "la seria", "la que respira bien". */
  label: string;
  /** The take it came from, so its origin is not lost. */
  voiceLabel: string;
  /** A short excerpt of what was being said when it worked. */
  excerpt: string;
  createdAt: number;
};

const KEY = "ttsstudio.seeds.v1";
const LIMIT = 100;
const EXCERPT_CHARS = 90;

const EMPTY: SavedSeed[] = [];

let cache: SavedSeed[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedSeed[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedSeed[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): SavedSeed[] {
  if (cache === null) cache = read();
  return cache;
}

function getServerSnapshot(): SavedSeed[] {
  return EMPTY;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commit(next: SavedSeed[]): void {
  cache = next.slice(0, LIMIT);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // A full quota must not cost the user the seed they just saved; the
    // in-memory list stands even when the write fails.
  }
  listeners.forEach((l) => l());
}

export function useSavedSeeds(): SavedSeed[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function excerptOf(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length > EXCERPT_CHARS ? `${clean.slice(0, EXCERPT_CHARS)}…` : clean;
}

/**
 * Save a seed, or rename it if it is already saved.
 *
 * Keyed by the seed itself: the same number twice is one entry, not two. The
 * newest naming wins and moves to the top, because re-saving is how you rename.
 */
export function saveSeed(entry: Omit<SavedSeed, "createdAt">): void {
  const rest = getSnapshot().filter((s) => s.seed !== entry.seed);
  commit([{ ...entry, createdAt: Date.now() }, ...rest]);
}

export function forgetSeed(seed: number): void {
  commit(getSnapshot().filter((s) => s.seed !== seed));
}

export function isSaved(seeds: SavedSeed[], seed: number | null): boolean {
  return seed !== null && seeds.some((s) => s.seed === seed);
}
