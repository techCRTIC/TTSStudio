#!/usr/bin/env python
"""
Transcribe a reference audio file so a voice can be registered.

WHY THIS EXISTS
    Qwen3PromptMaker needs BOTH the reference audio and its transcript
    (`ref_text`) to compute a voice embedding. Qwen3VoiceClone is explicit
    about it: "you must provide either 'prompt' OR ('ref_audio' AND
    'ref_text')" — and it rejects an empty string. Nothing in the engine
    produces that transcript, and no ASR pack is installed, so the app
    produces it here instead of inside a ComfyUI graph. See ADR-003.

THE TRIM CONTRACT (the reason --max-seconds exists)
    Qwen3PromptMaker trims `ref_audio` to `ref_audio_max_seconds` (default
    30.0) before computing the embedding. If we transcribe a 60s file whole
    and hand that text to a node that only listened to the first 30s, the
    text describes audio the model never heard, and the embedding degrades.

    So the trim happens HERE, and the caller MUST pass the same bound to the
    node. `max_seconds` in this script and `ref_audio_max_seconds` in the
    graph are two halves of one contract; `transcribed_seconds` is echoed in
    the output precisely so the caller can assert they match.

MODEL
    faster-whisper (CTranslate2). Deliberately NOT torch: the engine already
    owns the GPU, and a reference clip is short and transcribed once per
    voice, so int8 on the CPU keeps this off the graphics card entirely.
    Weights download once from Hugging Face into the standard HF cache.

USAGE
    .venv/Scripts/python.exe execution/transcribe_audio.py <audio> [options]

    --max-seconds N   Trim to N seconds before transcribing. Must equal the
                      node's ref_audio_max_seconds. -1 disables (default 30).
    --model NAME      faster-whisper model id (default large-v3).
    --language CODE   Force a language (default es). "auto" to detect.
    --device NAME     cpu (default) or cuda.

    Prints one JSON object to stdout. Diagnostics go to stderr, so stdout is
    always safe to parse.

EXIT CODES
    0 ok · 1 bad usage/missing file · 2 decode failure · 3 transcription
    failure (model download included) · 4 empty transcript
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

from _console import use_utf8

SAMPLE_RATE = 16_000  # what faster-whisper decodes to, and what we slice against


def log(message: str) -> None:
    """Diagnostics on stderr — stdout stays pure JSON for the caller."""
    print(message, file=sys.stderr, flush=True)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Transcribe a reference audio clip for voice registration."
    )
    parser.add_argument("audio", type=Path, help="Path to the reference audio file.")
    parser.add_argument(
        "--max-seconds",
        type=float,
        default=30.0,
        help="Trim to this many seconds first. MUST match the node's "
        "ref_audio_max_seconds. -1 disables trimming. Default: 30.",
    )
    parser.add_argument("--model", default="large-v3", help="Model id. Default: large-v3.")
    parser.add_argument(
        "--language",
        default="es",
        help="Language code, or 'auto' to detect. Default: es.",
    )
    parser.add_argument("--device", default="cpu", help="cpu (default) or cuda.")
    parser.add_argument(
        "--compute-type",
        default="int8",
        help="CTranslate2 compute type. Default: int8.",
    )
    return parser.parse_args(argv)


def load_audio(path: Path, max_seconds: float):
    """
    Decode to 16 kHz mono and trim.

    Returns (samples, decoded_seconds, transcribed_seconds). `decoded_seconds`
    is the file's real length; `transcribed_seconds` is what survived the trim
    and is therefore what the transcript actually describes.
    """
    from faster_whisper.audio import decode_audio

    samples = decode_audio(str(path), sampling_rate=SAMPLE_RATE)
    decoded_seconds = len(samples) / SAMPLE_RATE

    if max_seconds > 0:
        limit = int(max_seconds * SAMPLE_RATE)
        if len(samples) > limit:
            log(
                f"Trimming reference audio from {decoded_seconds:.1f}s to "
                f"{max_seconds:.1f}s so the transcript matches what the node hears."
            )
            samples = samples[:limit]

    return samples, decoded_seconds, len(samples) / SAMPLE_RATE


def transcribe(samples, args: argparse.Namespace) -> tuple[str, str]:
    """Run the model. Returns (text, detected_language)."""
    from faster_whisper import WhisperModel

    log(f"Loading model {args.model} ({args.device}/{args.compute_type})…")
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    segments, info = model.transcribe(
        samples,
        language=None if args.language == "auto" else args.language,
        # Deterministic on purpose: this transcript feeds a voice embedding,
        # and the same clip must always yield the same text. No temperature
        # fallback, no sampling.
        beam_size=5,
        temperature=0.0,
        # A reference clip is one person talking; VAD only risks eating a
        # quiet syllable and desyncing text from audio.
        vad_filter=False,
        condition_on_previous_text=False,
    )

    text = " ".join(segment.text.strip() for segment in segments).strip()
    return text, info.language


def main(argv: list[str] | None = None) -> int:
    # Windows defaults stdout to the console code page, which turns every
    # accented character into a byte Node cannot read back. See _console.
    use_utf8()

    args = parse_args(argv)

    if not args.audio.is_file():
        log(f"ERROR: no such audio file: {args.audio}")
        return 1

    started = time.monotonic()

    try:
        samples, decoded_seconds, transcribed_seconds = load_audio(args.audio, args.max_seconds)
    except Exception as cause:  # noqa: BLE001 — any decode failure is one outcome to the caller
        log(f"ERROR: could not decode audio: {cause}")
        return 2

    try:
        text, language = transcribe(samples, args)
    except Exception as cause:  # noqa: BLE001 — download and inference failures alike
        log(f"ERROR: transcription failed: {cause}")
        return 3

    if not text:
        # An empty transcript is a failure, not a result: the node rejects it.
        log("ERROR: the transcript came back empty — the clip may be silent.")
        return 4

    elapsed = time.monotonic() - started

    json.dump(
        {
            "text": text,
            "language": language,
            "model": args.model,
            "device": args.device,
            "decoded_seconds": round(decoded_seconds, 2),
            # The caller MUST pass this same bound to the node as
            # ref_audio_max_seconds. See "THE TRIM CONTRACT" above.
            "transcribed_seconds": round(transcribed_seconds, 2),
            "elapsed_seconds": round(elapsed, 2),
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")

    log(f"Done in {elapsed:.1f}s.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
