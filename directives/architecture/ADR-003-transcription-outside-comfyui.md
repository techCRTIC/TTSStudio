# ADR-003 — Reference-audio transcription runs in the app, not in ComfyUI

**Status:** Accepted — 2026-08-21 (session 2)
**Deciders:** user (approved from four options), orchestrator (recommended)
**Related:** ADR-001 (the engine bridge), ADR-002 (the app stack), roadmap Phase 2

## Context

Phase 2 is voice registration: the user supplies a reference clip and the app
computes a reusable voice embedding from it.

The engine's own code makes one requirement non-negotiable. `Qwen3PromptMaker`
takes `ref_text` — the transcript of the reference clip — as a **required**
input, and `Qwen3VoiceClone` states the rule verbatim:

> "For Voice Clone, you must provide either 'prompt' OR ('ref_audio' AND 'ref_text')."

It rejects an empty string (`nodes.py:744`, `nodes.py:765`). The pack ships its
example workflow under the name `simple_voice_clone-REQUIRES-ASR.json`, which
says the same thing more loudly.

**Nothing in the installed engine produces that transcript.** `server_info`
confirms exactly one pack installed: `comfyui-qwen3-tts`. No ASR anywhere.

So the transcript has to come from somewhere, and there were only three
sources: the user types it, a ComfyUI ASR pack produces it, or the app produces
it. The user rejected typing it by hand.

## Decision

**Transcription happens in the app, as a deterministic Python script under
`execution/`, using `faster-whisper`. No ASR node pack is installed into
ComfyUI.**

`execution/transcribe_audio.py` decodes the clip, trims it, transcribes it, and
prints one JSON object. The Next.js route handler calls it and returns the text
to the browser, where the user can **edit it before committing to the voice**.

## Rationale

- **The transcript must be editable before it is used, and that makes it a
  separate step by nature.** ASR mis-hears proper nouns — the very first real
  clip in this project contains four (Beto, Luciano, Mauricio, Andrés) — and
  `ref_text` is not cosmetic: a transcript that does not match the audio
  produces a worse embedding. A node buried inside the graph computes the text
  and consumes it in the same run, with no seam to correct it at. A separate
  step has that seam by construction.
- **It keeps the engine's GPU for the engine.** An ASR pack loads its weights
  into the same card as Qwen3-TTS. A reference clip is ~30 s and is transcribed
  once per voice, so `int8` on the CPU is enough and the graphics card is never
  contended.
- **`faster-whisper` does not pull in PyTorch.** Verified against PyPI: it
  depends on CTranslate2, onnxruntime, av, tokenizers, huggingface-hub, tqdm.
  The project venv stays small and independent of the engine's.
- **It is what `execution/` is for.** CLAUDE.md's Layer 3 is deterministic
  Python scripts; the folder existed empty until now. This is the first tool in
  it, and it fits without inventing a new place to put things.
- **Fewer third parties.** The candidate ASR packs (ComfyUI-Whisper,
  WhisperXX, WhisperCPP, TranscriptionTools) are separately-maintained repos
  with varying activity. Not installing one is one fewer dependency to track
  against engine upgrades.

## The trim contract (a seam this decision creates)

`Qwen3PromptMaker` trims `ref_audio` to `ref_audio_max_seconds` (default 30.0)
**before** computing the embedding. If the app transcribes a 60 s file whole and
hands that text to a node that only listened to the first 30 s, the transcript
describes audio the model never heard.

**Therefore the trim happens in the script, and the caller passes the same bound
to the node.** `--max-seconds` and `ref_audio_max_seconds` are two halves of one
contract. The script echoes `transcribed_seconds` in its output so the caller
can assert the halves agree.

This is a textbook seam in CLAUDE.md's sense: two sides must agree on a number
that neither side's tests can see whole. It is documented here and in the
script's docstring. **If it ever bites, `execution/check_trim_contract.py` gets
written in the same session as the fix.**

## Consequences

**Positive**
- The user corrects the transcript before the voice is computed.
- The engine install stays as it is: one pack, no new node code.
- The app gains a Python layer it was always designed to have.

**Negative**
- **A second runtime.** The app is no longer Node-only; `npm start` must be able
  to reach the project venv. The venv rule in CLAUDE.md already governs this,
  and `uv` makes it reproducible, but it is real added surface.
- **A model download of 2.9 GB** (measured, not estimated), fetched once into
  the Hugging Face cache. On this machine the first run took **610 s end to
  end, essentially all of it download**. First voice registration on a fresh
  machine pays that, with no progress shown — which makes it B-006's problem
  (install/preflight), not something to paper over at registration time.
- CPU transcription is slower than GPU, but measured it is fast enough to keep
  the GPU free: **16 s for a 10.6 s clip, 27 s for a 30 s clip** — under
  real time, once per voice. `large-v3` stays.

## Measurements (2026-08-21, session 2)

Run against the real reference clips, with the voice prompt's own stored
`ref_text` as ground truth — the strongest check available, since it is the
text that produced the voice already in use.

| Clip | Audio | Time | Result |
|---|---|---|---|
| `andres_bobe_ref_v3.wav` | 10.6 s | 16.2 s | 2 errors in 33 words |
| `andres_bobe_min1.wav` | 60 s → trimmed to 30 s | 26.9 s | both errors gone |

**The 10.6 s clip mis-transcribed the speaker's own name — "Andrés" became
"Andrea" — while getting the other three proper nouns right.** That single
result is the empirical case for the editable-transcript step: without it, the
voice would have been computed against a transcript naming the wrong person.
The 30 s clip got it right, so more context helps; it does not guarantee.

Repeated runs returned byte-identical text, confirming the deterministic
settings (`temperature=0`, no VAD, no conditioning on previous text).

**Neutral**
- Nothing here blocks moving transcription into the engine later; the route
  handler is the only caller, and its contract is "give me text for this audio".
- Under a future Tauri shell (B-005), the script is invoked the same way.
