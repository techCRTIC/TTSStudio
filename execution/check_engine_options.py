#!/usr/bin/env python
"""
Seam checker: the generation options the UI offers vs. what the node accepts.

THE SEAM
    Session 2 exposed three engine parameters in the interface — seed, language
    and max_new_tokens — and their bounds were copied from Qwen3VoiceClone's
    INPUT_TYPES into TypeScript constants:

      * web/src/lib/tts.ts          — LANGUAGES, TOKENS_MIN/MAX/STEP, SEED_MIN
      * <comfy>/custom_nodes/ComfyUI-Qwen3-TTS/nodes.py — the real declaration

    A copy is a fact frozen at a moment. The pack updates independently (it is a
    registry install, currently 1.7.0), and when a range or the language list
    changes, nothing in this project fails: the tests assert the TypeScript
    against ITSELF, the app builds, and the first sign of trouble is ComfyUI
    rejecting a graph at generation time — or worse, silently clamping.

    This is the same failure class as the trim contract
    (`check_trim_contract.py`): two sides of a boundary that no single analyzer
    sees whole. PRODUCT.md's second principle — "never promise what the engine
    cannot do" — is exactly what drifts here.

WHAT IT CHECKS
    1. The language list in tts.ts matches the node's combo, as a SET.
    2. TOKENS_MIN / TOKENS_MAX / TOKENS_STEP match the node's min/max/step.
    3. TOKENS_DEFAULT sits inside the node's range and on its step.
    4. SEED_MIN matches the node's own minimum.

BLIND SPOTS — do not credit this checker with more than it does
    * Literal-only. It reads both sources as text with regexes; a value computed
      at runtime is invisible to it.
    * It checks the CACHED voice-clone path (Qwen3VoiceClone). Other nodes in
      the pack have their own parameters and are not covered.
    * It cannot run when the engine pack is not installed, and says so rather
      than passing quietly — a checker that reports OK because it found nothing
      to check is worse than no checker.
    * It compares declarations, never behaviour.

EXIT CODES
    0 agreed · 1 the sides disagree · 2 could not read a file it needs
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

from _console import use_utf8

ROOT = Path(__file__).resolve().parent.parent
TTS_TS = ROOT / "web" / "src" / "lib" / "tts.ts"
PACK_NODES = Path.home() / "comfy" / "custom_nodes" / "ComfyUI-Qwen3-TTS" / "nodes.py"

problems: list[str] = []


def ts_number(source: str, name: str) -> float | None:
    """`export const NAME = <number>` — tolerating a simple arithmetic tail."""
    match = re.search(rf"export\s+const\s+{name}\s*(?::\s*number\s*)?=\s*([0-9.]+)", source)
    return float(match.group(1)) if match else None


def ts_languages(source: str) -> set[str] | None:
    """The LANGUAGES tuple in tts.ts."""
    match = re.search(r"export\s+const\s+LANGUAGES\s*=\s*\[(.*?)\]\s*as\s+const", source, re.DOTALL)
    if not match:
        return None
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def ts_presets(source: str) -> list[float] | None:
    """The token counts inside TOKEN_PRESETS, in order."""
    match = re.search(
        r"export\s+const\s+TOKEN_PRESETS\s*=\s*\[(.*?)\]\s*as\s+const", source, re.DOTALL
    )
    if not match:
        return None
    # `tokens: 384` and `tokens: TOKENS_MAX` both appear; only the literals can
    # be checked here, and the symbolic one is verified by its own comparison.
    return [float(n) for n in re.findall(r"tokens:\s*([0-9]+)", match.group(1))]


def node_block(source: str) -> str | None:
    """Qwen3VoiceClone's INPUT_TYPES body — the authority for everything here."""
    start = source.find("class Qwen3VoiceClone:")
    if start == -1:
        return None
    end = source.find("\nclass ", start + 1)
    return source[start : end if end != -1 else len(source)]


def node_languages(block: str) -> set[str] | None:
    """The language combo: a bracketed list of strings before its default."""
    match = re.search(r'"language"\s*:\s*\(\s*\[(.*?)\]\s*,', block, re.DOTALL)
    if not match:
        return None
    return set(re.findall(r'"([^"]+)"', match.group(1)))


def node_int_field(block: str, field: str, key: str) -> float | None:
    """One numeric key of an INT/FLOAT input's options dict."""
    field_match = re.search(rf'"{field}"\s*:\s*\(\s*"(?:INT|FLOAT)"\s*,\s*\{{(.*?)\}}', block, re.DOTALL)
    if not field_match:
        return None
    key_match = re.search(rf'"{key}"\s*:\s*([0-9a-fx.]+)', field_match.group(1))
    if not key_match:
        return None
    raw = key_match.group(1)
    return float(int(raw, 16)) if raw.startswith("0x") else float(raw)


def compare(label: str, ours: float | None, theirs: float | None) -> None:
    if ours is None:
        problems.append(f"No encontré {label} en {TTS_TS.relative_to(ROOT)}.")
    elif theirs is None:
        problems.append(f"No encontré {label} en el nodo del motor.")
    elif ours != theirs:
        problems.append(
            f"{label} NO coincide: la app usa {ours:g} y el nodo declara {theirs:g}."
        )


def main() -> int:
    # Windows defaults stdout to the console code page, which turns every
    # accented character into a byte Node cannot read back. See _console.
    use_utf8()

    try:
        ts_source = TTS_TS.read_text(encoding="utf-8")
    except OSError as cause:
        print(f"ERROR: no se pudo leer {TTS_TS}: {cause}")
        return 2

    if not PACK_NODES.is_file():
        # Not a pass. Saying so is the whole point.
        print(f"ERROR: el pack del motor no está en {PACK_NODES}; no puedo comprobar nada.")
        return 2

    block = node_block(PACK_NODES.read_text(encoding="utf-8"))
    if block is None:
        print("ERROR: no encontré la clase Qwen3VoiceClone en el pack.")
        return 2

    # 1. Languages, as a set — the order in the UI is ours to choose.
    ours_langs = ts_languages(ts_source)
    theirs_langs = node_languages(block)
    if ours_langs is None:
        problems.append("No encontré LANGUAGES en tts.ts.")
    elif theirs_langs is None:
        problems.append("No encontré la lista de idiomas en el nodo.")
    elif ours_langs != theirs_langs:
        missing = theirs_langs - ours_langs
        invented = ours_langs - theirs_langs
        if invented:
            problems.append(
                f"La app ofrece idiomas que el motor NO acepta: {sorted(invented)}. "
                "Es exactamente lo que PRODUCT.md prohíbe: prometer lo que el motor no da."
            )
        if missing:
            problems.append(f"El motor acepta idiomas que la app no ofrece: {sorted(missing)}.")

    # 2 & 3. The token ceiling.
    tokens_min = ts_number(ts_source, "TOKENS_MIN")
    tokens_max = ts_number(ts_source, "TOKENS_MAX")
    tokens_step = ts_number(ts_source, "TOKENS_STEP")
    tokens_default = ts_number(ts_source, "TOKENS_DEFAULT")

    compare("TOKENS_MIN", tokens_min, node_int_field(block, "max_new_tokens", "min"))
    compare("TOKENS_MAX", tokens_max, node_int_field(block, "max_new_tokens", "max"))
    compare("TOKENS_STEP", tokens_step, node_int_field(block, "max_new_tokens", "step"))

    if None not in (tokens_default, tokens_min, tokens_max, tokens_step):
        assert tokens_default is not None and tokens_min is not None
        assert tokens_max is not None and tokens_step is not None
        if not (tokens_min <= tokens_default <= tokens_max):
            problems.append(
                f"TOKENS_DEFAULT ({tokens_default:g}) queda fuera del rango del nodo "
                f"({tokens_min:g}..{tokens_max:g})."
            )
        elif tokens_default % tokens_step != 0:
            problems.append(
                f"TOKENS_DEFAULT ({tokens_default:g}) no cae en el paso de {tokens_step:g}."
            )

    # 4. The seed floor — the one that made a zero seed a real bug.
    compare("SEED_MIN", ts_number(ts_source, "SEED_MIN"), node_int_field(block, "seed", "min"))

    # 5. The presets the UI offers as durations. Each is a token count shown to
    #    the user as minutes and seconds, so one that falls outside the node's
    #    range or off its step is an option that simply fails when picked.
    presets = ts_presets(ts_source)
    if presets is None:
        problems.append("No encontré TOKEN_PRESETS en tts.ts.")
    elif None in (tokens_min, tokens_max, tokens_step):
        pass  # already reported above
    else:
        assert tokens_min is not None and tokens_max is not None and tokens_step is not None
        for tokens in presets:
            if not (tokens_min <= tokens <= tokens_max):
                problems.append(
                    f"El preset de {tokens:g} tokens queda fuera del rango del nodo "
                    f"({tokens_min:g}..{tokens_max:g}): elegirlo fallaría."
                )
            elif tokens % tokens_step != 0:
                problems.append(
                    f"El preset de {tokens:g} tokens no cae en el paso de {tokens_step:g}."
                )

    if problems:
        for problem in problems:
            print(f"ERROR: {problem}")
        return 1

    print(
        "OK: las opciones que ofrece la app coinciden con lo que declara el nodo "
        f"({len(ours_langs or [])} idiomas, tokens {tokens_min:g}..{tokens_max:g} "
        f"paso {tokens_step:g})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
