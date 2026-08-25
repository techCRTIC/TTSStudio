"""stdin must survive the pipe as UTF-8, on any console code page.

THE BUG THIS GUARDS
    `_console.use_utf8()` was written for stdout: on Windows the console code
    page is cp1252, so Python wrote "más" as a byte Node could not decode, and
    every accent reached the browser as U+FFFD. Stdin is the same bug mirrored
    — Node writes UTF-8, Python would decode it as cp1252 — and it appeared the
    moment a script started reading a script body from a pipe
    (`tts_trocear_guion.py`, called by /api/segments/split).

    It matters more on this side than on the other: the text coming IN is what
    the voice will say out loud. A mangled accent moves the stress of a word,
    and misplaced stress is one of the strongest signals that a cloned voice
    sounds foreign (the finding behind ADR-006).

WHY A SUBPROCESS AND NOT A DIRECT CALL
    The defect only exists in a real interpreter with real pipes attached.
    Calling `segmentar()` in-process would pass while the actual path stayed
    broken — which is exactly how this class of bug survived once already.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

EXECUTION = Path(__file__).resolve().parent.parent

# Every Spanish character that a cp1252 round trip mangles or drops, plus the
# inverted marks that only exist in this language's punctuation.
GUION = (
    "El niño comió más pan aquí, según él. ¿Y qué pasó después?\n\n"
    "«Nada», dijo ella… y añadió: ¡qué raro, qué antigüedad!"
)

# Asserted one by one rather than as a whole string, so a failure names the
# character that did not survive instead of just "these differ". Every one of
# them appears in GUION above — a letter listed here and absent there would
# fail for the wrong reason and prove nothing about the pipe.
ACENTOS = "ñáéíóúü¿¡«»…"


def _entorno_hostil() -> dict:
    """The environment this fix exists for, forced on rather than hoped for.

    The app sets PYTHONIOENCODING=utf-8 when it spawns a script, and a
    developer shell often has it set too — either one would make this test pass
    with `use_utf8()` deleted, which is a green light that proves nothing. So
    the child is started with the encoding pinned to the Windows console code
    page: the only thing that can save it now is the script reconfiguring its
    own streams.
    """
    hostil = dict(os.environ)
    hostil["PYTHONIOENCODING"] = "cp1252"
    return hostil


def _correr(entrada: str) -> subprocess.CompletedProcess:
    """Run the segmenter as the app runs it: no arguments, body over stdin."""
    return subprocess.run(
        [sys.executable, str(EXECUTION / "tts_trocear_guion.py")],
        input=entrada.encode("utf-8"),
        capture_output=True,
        env=_entorno_hostil(),
        # Deliberately NOT text=True: the point is to inspect the raw bytes
        # coming back, not to let Python decode them with a guess.
        check=False,
    )


def _segmentos(entrada: str) -> dict:
    completado = _correr(entrada)
    assert completado.returncode == 0, completado.stderr.decode("utf-8", "replace")
    return json.loads(completado.stdout.decode("utf-8"))


def test_los_acentos_sobreviven_al_tubo() -> None:
    salida = _segmentos(GUION)
    reconstruido = " ".join(s["text"] for s in salida["segments"])

    for caracter in ACENTOS:
        assert caracter in reconstruido, f"se perdió {caracter!r} al pasar por el tubo"


def test_el_texto_vuelve_intacto_salvo_espacios() -> None:
    salida = _segmentos(GUION)
    reconstruido = " ".join(s["text"] for s in salida["segments"])

    esperado = " ".join(GUION.split())
    assert " ".join(reconstruido.split()) == esperado


def test_stdout_son_bytes_utf8_validos() -> None:
    """The other half of the same contract, asserted on the bytes themselves.

    A cp1252 stdout decodes as UTF-8 with errors — this fails loudly if the
    output stream ever regresses, without depending on what the console is.
    """
    completado = _correr(GUION)
    completado.stdout.decode("utf-8")  # raises UnicodeDecodeError if it regressed
