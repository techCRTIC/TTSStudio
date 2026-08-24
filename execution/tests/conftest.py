"""Makes `execution/` importable from the tests that live under it.

The scripts are CLI tools, not a package: they sit flat in `execution/` and are
spawned by path from TypeScript (`web/src/lib/python.ts`). pytest collects from
the repo root, so without this the tests could not import them at all.
"""
from __future__ import annotations

import sys
from pathlib import Path

EXECUTION = Path(__file__).resolve().parent.parent
if str(EXECUTION) not in sys.path:
    sys.path.insert(0, str(EXECUTION))
