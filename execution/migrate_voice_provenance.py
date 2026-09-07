#!/usr/bin/env python
"""
Seed voice provenance sidecars from the legacy `voces.json` registry (ADR-005).

WHY THIS EXISTS
    ADR-005 introduced a per-voice sidecar (`<slug>.json`) holding who a voice
    belongs to. It was written believing the app had nowhere to record that.

    It was wrong. A registry ALREADY EXISTED — `voces.json`, in the same prompts
    directory, written on 2026-08-19 during the project's first session — and it
    carries nearly the same fields the sidecar defines:

        voces.json                    sidecar
        ---------------------------   -------------------------
        de                        ->  note        (where the audio came from)
        registrada                ->  registeredAt
        duracion_referencia_s     ->  refSeconds
        notas                     ->  note        (appended)
        archivo                   ->  (used to locate the voice)
        ref_text                  ->  NOT COPIED  (see below)

    Nothing read it. So the project's oldest voice would have shown "sin
    procedencia registrada" while its provenance sat unread on the same disk.
    That is worse than a missing feature: it is a feature failing on the one
    case it was built for.

WHAT IT DOES NOT DO
    * It does not copy `ref_text`. ADR-005 is explicit that the transcript is
      not part of provenance: it is not needed to establish who a voice belongs
      to, and it is a sentence a real person said. `voces.json` keeps its own
      copy; this script simply does not propagate it.
    * It does not delete or modify `voces.json`. That file is the user's, it
      holds history this script deliberately drops, and removing it is their
      call — not a side effect of a migration.
    * It never overwrites a field a sidecar already has. A record the user
      edited in the app wins over a legacy entry, always.
    * It does not invent. A voice absent from `voces.json` is left exactly as it
      is; "we do not know" is a valid provenance and a fabricated one is not.

USAGE
    python execution/migrate_voice_provenance.py            # dry run, default
    python execution/migrate_voice_provenance.py --apply    # actually write

    Dry run is the default on purpose: this writes into ComfyUI's own model
    directory, and a migration that runs before anyone has read its plan is how
    data gets quietly mangled.

EXIT CODES
    0 done (or nothing to do) · 1 something was wrong with the input
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from _console import use_utf8

LEGACY_NAME = "voces.json"
EMBEDDING_EXT = ".safetensors"

#: Mirrors the TypeScript side's bounds so a migrated record is one the app
#: would itself have written. See web/src/lib/provenance.ts.
NAME_MAX = 60
NOTE_MAX = 500


def prompts_dir() -> Path:
    """Where the engine keeps voice embeddings. Same rule as comfy-files.ts."""
    root = os.environ.get("COMFY_ROOT")
    base = Path(root) if root else Path.home() / "comfy"
    return base / "models" / "Qwen3-TTS" / "prompts"


def epoch_ms(date_text: str) -> int:
    """
    "2026-08-19" -> epoch milliseconds, or 0 when it cannot be read.

    Zero means "unknown" throughout this project, and the interface keys off
    `> 0`. Guessing a date would be inventing provenance.
    """
    from datetime import datetime, timezone

    try:
        parsed = datetime.strptime(date_text.strip(), "%Y-%m-%d")
    except (ValueError, AttributeError):
        return 0
    return int(parsed.replace(tzinfo=timezone.utc).timestamp() * 1000)


def note_from(entry: dict) -> str:
    """
    Build the note out of the two legacy free-text fields.

    `de` says where the audio came from and `notas` says what was done to it.
    Both are provenance in the ordinary sense of the word, and dropping either
    would lose the only human-readable account of how this voice was made.
    """
    parts = [str(entry.get(key, "")).strip() for key in ("de", "notas")]
    return " · ".join(p for p in parts if p)[:NOTE_MAX]


def label_from_slug(slug: str) -> str:
    """Mirror of `labelFor` in web/src/lib/tts.ts: martin_vega -> Martin Vega."""
    words = [w for w in slug.replace("-", "_").split("_") if w]
    return " ".join(w[0].upper() + w[1:] for w in words)[:NAME_MAX]


def main() -> int:
    use_utf8()

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write the sidecars (without it, only report what would change)",
    )
    args = parser.parse_args()

    directory = prompts_dir()
    if not directory.is_dir():
        print(f"ERROR: no existe el directorio de voces: {directory}")
        return 1

    legacy_path = directory / LEGACY_NAME
    if not legacy_path.exists():
        print(f"No hay {LEGACY_NAME} en {directory}: nada que migrar.")
        return 0

    try:
        legacy = json.loads(legacy_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as cause:
        print(f"ERROR: no pude leer {legacy_path}: {cause}")
        return 1

    if not isinstance(legacy, dict):
        print(f"ERROR: {LEGACY_NAME} no tiene la forma esperada (un objeto por voz).")
        return 1

    voices = sorted(p.name for p in directory.glob(f"*{EMBEDDING_EXT}"))
    if not voices:
        print(f"No hay ninguna voz en {directory}.")
        return 0

    changed = 0

    for voice_file in voices:
        slug = voice_file[: -len(EMBEDDING_EXT)]
        sidecar = directory / f"{slug}.json"

        entry = legacy.get(slug)
        # A legacy entry may key on the file rather than the slug.
        if entry is None:
            entry = next(
                (v for v in legacy.values()
                 if isinstance(v, dict) and v.get("archivo") == voice_file),
                None,
            )

        current = {}
        if sidecar.exists():
            try:
                loaded = json.loads(sidecar.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    current = loaded
            except (OSError, json.JSONDecodeError):
                current = {}

        merged = dict(current)

        # The display name: never leave the raw slug on screen. A name the user
        # typed always wins; otherwise derive it the way the app does.
        name = str(current.get("displayName", "")).strip()
        if not name or name == slug:
            merged["displayName"] = label_from_slug(slug)

        if entry is not None:
            if not str(current.get("note", "")).strip():
                note = note_from(entry)
                if note:
                    merged["note"] = note

            if not current.get("registeredAt"):
                when = epoch_ms(str(entry.get("registrada", "")))
                if when:
                    merged["registeredAt"] = when

            if not current.get("refSeconds"):
                seconds = entry.get("duracion_referencia_s")
                if isinstance(seconds, (int, float)) and seconds > 0:
                    merged["refSeconds"] = round(seconds)

            # The legacy registry only ever described voices built from an
            # existing recording, so "upload" is the honest source — but only
            # when nothing already says otherwise.
            if not str(current.get("source", "")).strip():
                merged["source"] = "upload"

        merged.setdefault("registeredAt", 0)
        merged.setdefault("refSeconds", 0)
        merged.setdefault("note", "")
        merged.setdefault("source", "pre-existing")

        if merged == current:
            print(f"  =  {slug}: ya está al día")
            continue

        changed += 1
        origin = "voces.json" if entry is not None else "solo el nombre"
        print(f"  {'->' if args.apply else '~ '} {slug}: se actualiza ({origin})")
        for key in ("displayName", "source", "registeredAt", "refSeconds", "note"):
            before, after = current.get(key), merged.get(key)
            if before != after:
                shown_before = "(vacío)" if before in (None, "", 0) else before
                print(f"        {key}: {shown_before}  ->  {after}")

        if args.apply:
            sidecar.write_text(
                json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

    print()
    if changed == 0:
        print("Nada que hacer: todas las procedencias están al día.")
    elif args.apply:
        print(f"Listo: {changed} procedencia(s) actualizada(s).")
        print(f"{LEGACY_NAME} NO se tocó: sigue siendo tuyo y guarda el ref_text.")
    else:
        print(f"Simulación: {changed} procedencia(s) cambiarían.")
        print("Vuelve a ejecutarlo con --apply para escribirlas.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
