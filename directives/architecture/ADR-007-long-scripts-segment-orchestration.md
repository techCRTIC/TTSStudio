# ADR-007 — Long scripts: where segment orchestration lives, and who writes the joined piece

**Status:** accepted
**Date:** 2026-08-24
**Amends:** ADR-001 (HTTP bridge — reaffirmed, D2), ADR-004 (filesystem access — amended, D3)
**Corrects:** the roadmap's Fase 1 line "progreso real desde el websocket de ComfyUI". There is no websocket. See Context.
**Opens:** roadmap Fase 3

## Context

The engine cannot say a long script in one call. Two hard ceilings: ~8192 audio
tokens and 2048 input characters per pass. A multi-minute script is therefore
**composed, not generated** — and every part of the app built so far assumes one
submission, one prompt id, one `.flac`, one history entry.

The division of labour was decided with the user before this ADR and is not
re-litigated here: the segmentation and the join come from the user's
`voz-local` skill (`tts_narrar_largo.py`) into `execution/`; the generation does
**not**, because the app already reaches the engine over HTTP and porting the
script's `comfy` CLI call would open a second path to the same engine.

**Verified in the code before writing this, not recalled:**

| Fact | Where |
|---|---|
| **There is no websocket.** The client polls `/api/status/:promptId` every 700 ms. | `web/src/app/page.tsx:213-255` |
| The engine reports only queued/position/running — which is why `StatusLine.tsx` refuses to draw a progress bar. | `web/src/components/StatusLine.tsx` |
| `comfy-files.ts` is the **only** module touching `node:fs`; its mutations are exactly two — delete a file, read/write a voice sidecar. It cannot write audio. | `web/src/lib/comfy-files.ts:14-29` |
| The take DELETE route accepts **one** `filename` per request. | `web/src/app/api/takes/route.ts:15-33` |
| `deleteTake` deletes disk first, entry second, and its docstring states that leaving either half behind is the wrong outcome. | `web/src/lib/history.ts:109-141` |
| `commit()` swallows quota errors in silence; the limit is 200 takes. | `web/src/lib/history.ts:79-88` |
| `runScript` defaults to a 60 s timeout and resolves — does not reject — on non-zero exit. | `web/src/lib/python.ts:74-133` |
| `soundfile>=0.14.0` is declared and reads the FLAC that `SaveAudio` writes. `librosa` is not needed. | `pyproject.toml` |

**The constraint that shapes everything**, from the roadmap's own exit criteria:
*if the text yields a single segment, the path must be byte for byte the one that
runs today — not one extra Python process, not one extra call.* A short sentence
must not become more expensive because long scripts now exist.

## Decision

### D1 — "Is this long?" is a character count in TypeScript, and the threshold is a declared seam

Asking the segmenter how many segments there are **is** the extra Python process
the constraint forbids. So the guard is a length comparison in TypeScript, and
the 600 necessarily exists in two languages: `SEGMENT_MAX_CHARS` in
`web/src/lib/tts.ts` (beside the other measured engine constants) and
`MAX_CHARS` in `execution/tts_trocear_guion.py`.

The duplication is accepted **deliberately and paid for in the same session**
with `execution/check_segment_contract.py`, which reads both sides, exits 1 when
they disagree, exits 2 when a side is unreadable, and declares its blind spots
in its docstring — the contract already set by `check_trim_contract.py`. A text
of exactly the threshold takes today's path.

### D2 — The client stays the sequencer; the server keeps owning every engine call

| Option | Verdict |
|---|---|
| Browser drives N submissions directly against ComfyUI | **Forbidden.** ADR-001: the 403 origin check is measured, not predicted. |
| A server route that runs the whole script and holds the job | Rejected: needs a server-side job store, and it rewrites the short path — the one thing that must not change. |
| **Client sequences; each segment is today's POST plus today's poll** | **Accepted.** The short path is literally the N=1 case of the long one. |

Honest progress is **"tramo K de N" plus the engine's real state** (queued with
position, or running). No percentage and no estimate: `StatusLine.tsx` already
documents why the engine cannot support one.

**Accepted cost:** closing the tab strands the run. Resuming a partial script is
out of scope for Fase 3.

### D3 — The joined piece is written by Python, to a path only `comfy-files.ts` is allowed to compute

This is the amendment to ADR-004.

| Option | Cost |
|---|---|
| Script derives its own output path in ComfyUI's `output/` | Free plumbing — but a second writer of engine territory outside the `resolveInside` fence, in a language that never learned the rules. |
| Write to a project-owned directory | Keeps the fence intact — and needs new plumbing for playback, download and deletion, three surfaces that work today. |
| **Server computes the absolute output path via `comfy-files.ts` and passes it as an argument; the script writes exactly there and derives nothing** | **Accepted.** |

This keeps ADR-004's real invariant — *one module decides which paths are legal*
— while the piece still lands where every existing route can already reach it.
The script becomes a pure transformer: absolute paths in, one absolute path out,
refusing anything relative or derived.

**And the sample rate is read, never assumed.** 24000 Hz is a belief about what
`SaveAudio` writes, not a measurement. The joiner reads the rate from the first
segment and aborts naming both rates if any segment differs. A wrong assumption
here produces a piece with a sped-up voice and **zero red tests**.

### D4 — Loop verification runs per segment, as a header read

Verifying only at join time discovers a bad segment after the whole script has
been paid for, when retrying is expensive. So each segment is verified as it
lands: one spawn per segment, on the multi-segment path only (D1's constraint is
untouched), reading frames divided by samplerate from the header rather than
decoding.  It is off the critical path — the engine spends seconds to minutes
per segment.

A segment failing verification is regenerated with a **different** seed up to a
declared maximum. Exhausted, the run stops and names that segment. **A silently
bad piece is the one outcome not permitted.**

**The minimum-length gate below which the 8–22 c/s band is not applied is
deliberately UNCALIBRATED.** Short segments, digits and acronyms produce false
positives, and each false positive costs a full regeneration. It ships as a
named, commented constant awaiting measurement. This project already published
an assumed 12 Hz that measurement turned into 12.56; that is why a guessed
number is not written down as a settled one here.

### D5 — A take becomes composite, without breaking the key or the old takes

New `Take` fields are **optional** and `ttsstudio.history.v1` does not change —
the precedent is `good`, whose docstring already states why absent must not read
as false. Each segment records its **effective seed**, so the piece is
reproducible segment by segment.

Deletion is the part that genuinely breaks: one entry no longer means one file.
`/api/takes` DELETE therefore accepts a **list** in one request, validates every
path before deleting any, and reports success or failure **per file** so a
partial failure is visible instead of leaving silent orphans. The single-file
path keeps its exact current behaviour and response shape.

**Still open:** `commit()` swallows a full-quota write in silence, and a long
take multiplies what a take stores, so that failure becomes reachable. Recorded
in the backlog rather than fixed here.

### D6 — The deterministic half gets a real test harness

Two new Python scripts carry the parts most amenable to deterministic proof —
sentence boundaries, the comma fallback terminating, the c/s verdict at both
edges — and this project had **no way to test Python at all**: all 109 tests are
Vitest under `web/tests/`. Verifying them by hand is precisely what ADR-006
exists to avoid.

`pytest` is added as a **dev-only** dependency group in `pyproject.toml`, with
tests under `execution/tests/` and `testpaths` scoped there so Vitest's
`web/tests/` is never collected. The JSON-over-stdout contract stays covered
from the TypeScript side too, because that is the surface the app consumes.

## Consequences

- The short path is unchanged and provably so: the seam checker fails when the
  two thresholds drift apart.
- Long runs are tab-bound. Fase 3 does not resume a partial script.
- The piece lands in ComfyUI's `output/`, so playback, download and the history
  keep working with no new routes on that side.
- Python is now testable, which it was not.
- One number — the minimum-length gate — is knowingly unmeasured and marked as
  such in the code. Measuring it is a follow-up.
