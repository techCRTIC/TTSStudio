#!/usr/bin/env python
"""
Seam checker: the long-script segmentation threshold contract.

THE SEAM
    A script long enough is split into segments before it is sent to the
    engine, instead of going through as a single call. Two independent pieces
    of code decide where that line is drawn, and they never call each other:

      * execution/tts_trocear_guion.py — MAX_CHARS, the character count above
                                          which the Python chunker splits a
                                          script into segments.
      * web/src/lib/tts.ts             — SEGMENT_MAX_CHARS, the character
                                          count the client uses to decide
                                          whether to walk the "segment K of N"
                                          path or send one single-shot call.

    If the two numbers disagree, the same script is short on one side of the
    seam and long on the other. A script just above the TypeScript threshold
    would still take the single-call path in the UI while the Python chunker
    would have split it — or the other way around: one side segments a script
    the other would have sent whole, for the exact same input text.

WHAT IT CHECKS
    The Python literal and the TypeScript literal are the same number.

BLIND SPOTS — do not credit this checker with more than it does
    * Literal-only. It reads source text with regexes; a value computed at
      runtime, read from the environment, or passed in by a caller is
      invisible to it.
    * It does not run either program, so it proves agreement of numbers,
      never agreement of behaviour (e.g. it does not check that both sides
      split ON the same character — sentence boundary, hard cut, etc.).
    * It does not check for a second, competing literal elsewhere in either
      file, unlike the trim-contract checker's point 2.

EXIT CODES
    0 agreed · 1 the sides disagree · 2 could not read a file it needs (or
    could not find the constant in a file it could read)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from _console import use_utf8

ROOT = Path(__file__).resolve().parent.parent

PY_CHUNKER = ROOT / "execution" / "tts_trocear_guion.py"
TS_LIB = ROOT / "web" / "src" / "lib" / "tts.ts"

problems: list[str] = []


def read(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except OSError as cause:
        problems.append(f"No se pudo leer {path}: {cause}")
        return None


def py_constant(source: str) -> int | None:
    """MAX_CHARS = <number> in tts_trocear_guion.py."""
    match = re.search(r"^MAX_CHARS\s*=\s*([0-9]+)", source, re.MULTILINE)
    return int(match.group(1)) if match else None


def ts_constant(source: str) -> int | None:
    """SEGMENT_MAX_CHARS = <number> in tts.ts."""
    match = re.search(
        r"export\s+const\s+SEGMENT_MAX_CHARS\s*(?::\s*number\s*)?=\s*([0-9]+)", source
    )
    return int(match.group(1)) if match else None


def main() -> int:
    # Windows defaults stdout to the console code page, which turns every
    # accented character into a byte Node cannot read back. See _console.
    use_utf8()

    py_source = read(PY_CHUNKER)
    ts_source = read(TS_LIB)
    if py_source is None or ts_source is None:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 2

    py_value = py_constant(py_source)
    ts_value = ts_constant(ts_source)

    if py_value is None:
        problems.append(
            f"No encontré MAX_CHARS en {PY_CHUNKER.relative_to(ROOT)} "
            "(¿se renombró la constante?)."
        )
    if ts_value is None:
        problems.append(
            f"No encontré SEGMENT_MAX_CHARS en {TS_LIB.relative_to(ROOT)} "
            "(¿se renombró la constante?)."
        )
    if py_value is None or ts_value is None:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 2

    if py_value != ts_value:
        problems.append(
            f"Los dos lados del contrato de troceo NO coinciden: el troceador "
            f"de Python corta a los {py_value} caracteres (tts_trocear_guion.py) "
            f"pero la interfaz decide el camino de tramos a los {ts_value} "
            "caracteres (tts.ts). Un guión justo por encima del umbral de "
            "TypeScript seguiría el camino de una sola llamada en la interfaz "
            "mientras Python sí lo trocearía — o al revés: un lado trocea la "
            "misma entrada que el otro envía entera."
        )
        for problem in problems:
            print(f"ERROR: {problem}")
        return 1

    print(f"OK: el umbral de troceo coincide en ambos lados ({py_value} caracteres).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
