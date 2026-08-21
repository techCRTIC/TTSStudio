#!/usr/bin/env python
"""
Seam checker: the reference-audio trim contract (ADR-003).

THE SEAM
    A voice embedding is computed from a reference clip PLUS its transcript.
    Two independent pieces of code decide how much of that clip is used:

      * web/src/lib/voices.ts   — REF_AUDIO_MAX_SECONDS, sent to the graph as
                                  Qwen3PromptMaker's `ref_audio_max_seconds`
      * execution/transcribe_audio.py — the --max-seconds default, which
                                  decides how much audio is transcribed

    They are written in different languages, tested by different suites, and
    nothing fails if they disagree. If the transcript covers 60s but the node
    listens to 30s, the text describes audio the model never heard: the voice
    comes out worse and every test stays green. That is the exact failure class
    CLAUDE.md § "Self-annealing extends to seams" exists for.

WHAT IT CHECKS
    1. The TypeScript constant and the Python CLI default are the same number.
    2. Neither side hardcodes a second, competing literal where the shared
       constant should be used.
    3. If the engine pack is readable, that our bound does not exceed the
       node's own maximum (its FLOAT input caps at 120).

BLIND SPOTS — do not credit this checker with more than it does
    * Literal-only. It reads source text with regexes; a value computed at
      runtime, read from env, or passed by a caller is invisible to it.
    * It checks DEFAULTS. A caller that explicitly passes mismatched values on
      both sides is a real break this cannot see — that is what the unit test
      `the node's bound is the same one the transcript was made under` covers
      for the TypeScript half.
    * It does not run either program, so it proves agreement of numbers, never
      agreement of behaviour.

EXIT CODES
    0 agreed (warnings possible) · 1 the sides disagree · 2 could not read a
    file it needs
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from _console import use_utf8

ROOT = Path(__file__).resolve().parent.parent

VOICES_TS = ROOT / "web" / "src" / "lib" / "voices.ts"
TRANSCRIBE_PY = ROOT / "execution" / "transcribe_audio.py"
# Optional: only present on a machine with the engine installed.
PACK_NODES = Path.home() / "comfy" / "custom_nodes" / "ComfyUI-Qwen3-TTS" / "nodes.py"

problems: list[str] = []
warnings: list[str] = []


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as cause:
        problems.append(f"No se pudo leer {path}: {cause}")
        return None


def ts_constant(source: str) -> float | None:
    """REF_AUDIO_MAX_SECONDS = <number> in voices.ts."""
    match = re.search(
        r"export\s+const\s+REF_AUDIO_MAX_SECONDS\s*(?::\s*number\s*)?=\s*([0-9.]+)", source
    )
    return float(match.group(1)) if match else None


def py_default(source: str) -> float | None:
    """The --max-seconds default in transcribe_audio.py's argparse block."""
    match = re.search(
        r'add_argument\(\s*["\']--max-seconds["\'].*?default\s*=\s*([0-9.]+)',
        source,
        re.DOTALL,
    )
    return float(match.group(1)) if match else None


def node_ceiling(source: str) -> float | None:
    """The `max` of Qwen3PromptMaker's ref_audio_max_seconds FLOAT input."""
    match = re.search(
        r'"ref_audio_max_seconds"\s*:\s*\(\s*"FLOAT"\s*,\s*\{[^}]*?"max"\s*:\s*([0-9.]+)',
        source,
    )
    return float(match.group(1)) if match else None


def main() -> int:
    # Windows defaults stdout to the console code page, which turns every
    # accented character into a byte Node cannot read back. See _console.
    use_utf8()

    ts_source = read(VOICES_TS)
    py_source = read(TRANSCRIBE_PY)
    if ts_source is None or py_source is None:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 2

    ts_value = ts_constant(ts_source)
    py_value = py_default(py_source)

    if ts_value is None:
        problems.append(
            f"No encontré REF_AUDIO_MAX_SECONDS en {VOICES_TS.relative_to(ROOT)} "
            "(¿se renombró la constante?)."
        )
    if py_value is None:
        problems.append(
            f"No encontré el default de --max-seconds en {TRANSCRIBE_PY.relative_to(ROOT)}."
        )

    if ts_value is not None and py_value is not None and ts_value != py_value:
        problems.append(
            f"Los dos lados del contrato NO coinciden: el grafo recorta a {ts_value}s "
            f"(voices.ts) pero se transcriben {py_value}s (transcribe_audio.py). "
            "La transcripción describiría audio que el modelo no escuchó."
        )

    # 2. A second literal where the shared constant belongs.
    if ts_source.count("ref_audio_max_seconds") and re.search(
        r"ref_audio_max_seconds\s*:\s*[0-9]", ts_source
    ):
        problems.append(
            "voices.ts pasa un número literal como ref_audio_max_seconds en vez de "
            "la constante compartida — es como el contrato se rompe en silencio."
        )

    # 3. Our bound against the node's own ceiling, when the engine is present.
    pack_source = PACK_NODES.read_text(encoding="utf-8") if PACK_NODES.is_file() else None
    if pack_source is None:
        warnings.append(
            f"El pack del motor no está en {PACK_NODES} — no pude comprobar el techo del nodo."
        )
    else:
        ceiling = node_ceiling(pack_source)
        if ceiling is None:
            warnings.append("No encontré el `max` de ref_audio_max_seconds en el pack.")
        elif ts_value is not None and ts_value > ceiling:
            problems.append(
                f"El límite configurado ({ts_value}s) supera el máximo que acepta el nodo "
                f"({ceiling}s); ComfyUI rechazará el grafo."
            )

    for warning in warnings:
        print(f"WARNING: {warning}")

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 1

    print(f"OK: el contrato del recorte coincide en ambos lados ({ts_value}s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
