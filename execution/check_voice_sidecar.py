#!/usr/bin/env python
"""
Seam checker: the provenance sidecar's invisibility to the engine (ADR-005).

THE SEAM
    Provenance for a voice `X` is stored in `X.json`, written by the app into
    ComfyUI's own `models/Qwen3-TTS/prompts/` directory — the same directory
    the engine scans to build the list of available voices.

    That is only safe because of ONE line in somebody else's code:

        for f in os.listdir(QWEN3_TTS_PROMPTS_DIR):
            if f.endswith(".safetensors"):

    (`Qwen3LoadPrompt.INPUT_TYPES`, in the pack's nodes.py.)

    If that filter ever widens — the pack lists everything, or adds `.json`
    support, or switches to a glob — then EVERY provenance file this app has
    ever written instantly becomes a fake voice in the user's dropdown. The app
    would offer to generate speech with `martin_vega.json`, which is not a voice
    embedding at all.

    Nothing in this project would see it. The pack is a third-party dependency
    that updates on its own schedule; our tests never read its source; the
    TypeScript side has no way to know. The break lives entirely in the gap
    between two codebases, which is the definition of a seam.

WHAT IT CHECKS
    1. The pack is installed and its voice-listing code is readable.
    2. That listing filters on the `.safetensors` extension.
    3. That the extension it filters on is the same one this app writes
       embeddings as, and is NOT the sidecar extension.
    4. That the app's own two halves agree on the sidecar extension: the path
       builder in comfy-files.ts and the id shape it derives from.

BLIND SPOTS — do not credit this checker with more than it does
    * Literal-only, like the other checkers here. It reads source text with
      regexes. A filter computed at runtime, read from a config, or delegated to
      a helper in another module is invisible to it.
    * It does not run ComfyUI. It proves the SOURCE says the right thing, never
      that a running engine behaves that way — a different pack version could be
      loaded than the one on disk.
    * It cannot see a filter that is correct but applied in the wrong place
      (e.g. listing everything and filtering after sorting).
    * If the pack is not installed it reports a WARNING and exits 0. An absent
      dependency is not a broken contract, and this must not fail a machine that
      simply has no engine set up.

EXIT CODES
    0 contract holds (warnings possible) · 1 the contract is broken
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from _console import use_utf8

PROJECT_ROOT = Path(__file__).resolve().parent.parent

#: What the app writes voice embeddings as — the engine must list exactly this.
EMBEDDING_EXT = ".safetensors"
#: What the app writes provenance as — the engine must NOT list this.
SIDECAR_EXT = ".json"


def comfy_root() -> Path:
    """
    Where ComfyUI lives.

    Mirrors the TypeScript side's rule (`COMFY_ROOT ?? ~/comfy`) rather than
    inventing a second convention, so a machine that configured one is not
    checked against the other.
    """
    configured = os.environ.get("COMFY_ROOT")
    return Path(configured) if configured else Path.home() / "comfy"


def find_pack_source(root: Path) -> Path | None:
    """The pack's nodes.py, if this machine has the pack installed."""
    candidates = sorted((root / "custom_nodes").glob("*[Qq]wen3*[Tt][Tt][Ss]*/nodes.py"))
    return candidates[0] if candidates else None


def listing_block(source: str) -> str | None:
    """
    The body of the voice-listing loop.

    Anchored on the directory constant rather than on a line number: the pack
    is a moving dependency and line numbers are worthless across versions.
    """
    match = re.search(
        r"for\s+\w+\s+in\s+os\.listdir\(\s*QWEN3_TTS_PROMPTS_DIR\s*\)\s*:(.{0,400})",
        source,
        re.DOTALL,
    )
    return match.group(1) if match else None


def sidecar_ext_in_app() -> tuple[str | None, str | None]:
    """
    What the app itself believes, read from its own source.

    Returns (extension it strips, extension it writes) so a mismatch between the
    two halves of `voiceSidecarPath` is caught here rather than at runtime.
    """
    ts = PROJECT_ROOT / "web" / "src" / "lib" / "comfy-files.ts"
    if not ts.exists():
        return None, None
    text = ts.read_text(encoding="utf-8")

    match = re.search(
        r"voiceId\.replace\(\s*/\\\.(\w+)\$/i\s*,\s*[\"']\.(\w+)[\"']\s*\)",
        text,
    )
    if not match:
        return None, None
    return f".{match.group(1)}", f".{match.group(2)}"


def main() -> int:
    use_utf8()

    problems: list[str] = []
    warnings: list[str] = []

    # --- the app's own two halves ------------------------------------------
    stripped, written = sidecar_ext_in_app()
    if stripped is None:
        warnings.append(
            "No pude leer cómo construye la ruta del sidecar comfy-files.ts "
            "(¿cambió `voiceSidecarPath`?)."
        )
    else:
        if stripped != EMBEDDING_EXT:
            problems.append(
                f"La app deriva el sidecar quitando «{stripped}», pero las voces se "
                f"guardan como «{EMBEDDING_EXT}»."
            )
        if written != SIDECAR_EXT:
            problems.append(
                f"La app escribe el sidecar como «{written}», pero este verificador "
                f"comprueba «{SIDECAR_EXT}». Uno de los dos está desactualizado."
            )

    # --- the engine's side --------------------------------------------------
    root = comfy_root()
    pack = find_pack_source(root)

    if pack is None:
        warnings.append(
            f"El pack comfyui-qwen3-tts no está instalado bajo {root}; no pude "
            "verificar el filtro del motor. Instálalo y vuelve a ejecutar."
        )
    else:
        source = pack.read_text(encoding="utf-8", errors="replace")
        block = listing_block(source)

        if block is None:
            problems.append(
                f"No encontré el bucle que lista las voces en {pack}. El pack cambió "
                "de forma: revisa a mano si sigue filtrando por "
                f"«{EMBEDDING_EXT}» antes de confiar en los sidecars."
            )
        else:
            filtered = re.findall(r"endswith\(\s*[\"'](\.\w+)[\"']\s*\)", block)

            if not filtered:
                problems.append(
                    "El pack ya NO filtra por extensión al listar las voces: cada "
                    "archivo de procedencia aparecerá como una voz falsa en el "
                    "selector. Hay que mover los sidecars fuera del directorio del "
                    "motor (ADR-005)."
                )
            else:
                if EMBEDDING_EXT not in filtered:
                    problems.append(
                        f"El pack filtra por {filtered} y ya no por «{EMBEDDING_EXT}»: "
                        "la app está guardando las voces con una extensión que el "
                        "motor no lista."
                    )
                if SIDECAR_EXT in filtered:
                    problems.append(
                        f"El pack ahora lista también «{SIDECAR_EXT}»: los archivos de "
                        "procedencia se están mostrando como voces. Hay que sacarlos "
                        "del directorio del motor (ADR-005)."
                    )

    for warning in warnings:
        print(f"WARNING: {warning}")

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 1

    # An honest closing line. Saying "the engine lists only .safetensors" when
    # the pack could not even be read would be exactly the kind of unearned
    # reassurance a checker exists to prevent.
    if pack is None:
        print(
            f"OK: la app deriva bien el sidecar («{EMBEDDING_EXT}» -> «{SIDECAR_EXT}»), "
            "pero SIN el pack instalado no se pudo verificar el lado del motor."
        )
    else:
        print(
            f"OK: el motor lista solo «{EMBEDDING_EXT}», así que los archivos "
            f"«{SIDECAR_EXT}» de procedencia le son invisibles."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
