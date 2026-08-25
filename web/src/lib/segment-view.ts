import type { SegmentTrack, ScriptSegment } from "./long-script.ts";
import type { SegmentInfo } from "@/components/SegmentStrip";

/**
 * Turn the sequencer's record into what the strip draws.
 *
 * THE BUG THIS EXISTS FOR — found against the real engine, 2026-08-24.
 *   The screen used to map over `tracks`, and `tracks` GROWS: the sequencer
 *   walks the script one segment at a time and only records a track once that
 *   segment starts. So a three-segment script showed "tramo 1 de 1", then
 *   "de 2", then "de 3" — the total climbing behind the position, which is the
 *   one number a person is watching to know how much is left.
 *
 *   The status line above it was right the whole time, because it counts
 *   `segments`. That is the fix, stated as a rule: **`segments` is how many
 *   there are; `tracks` is only what is known about them so far.** A segment
 *   with no track yet is pending — it is not missing.
 *
 * Pure and exported so this is a test instead of a thing someone notices in
 * production a second time.
 */
export function segmentViews(
  segments: ScriptSegment[],
  tracks: SegmentTrack[],
): SegmentInfo[] {
  const byIndex = new Map(tracks.map((track) => [track.index, track]));

  return segments.map((segment) => {
    const track = byIndex.get(segment.index);
    if (!track) {
      // Not started yet. Its text and its cut are already known from the split,
      // which is what lets the very same strip serve as the cut preview before
      // a single generation has run.
      return {
        index: segment.index,
        text: segment.text,
        state: "pending" as const,
        chars: segment.chars,
        boundary: segment.boundary,
      };
    }

    return {
      index: track.index,
      text: track.text,
      state: track.status,
      chars: track.chars,
      boundary: track.boundary,
      ...(track.seed !== null ? { seed: track.seed } : {}),
      ...(track.error ? { error: track.error } : {}),
    };
  });
}
