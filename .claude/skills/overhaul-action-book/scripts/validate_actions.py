#!/usr/bin/env python3
"""Path/consistency validator for Overhaul Kit action books.

Read-only, pure stdlib. Exit 1 on errors.

Guards the failure class where a plan orders work on files that do not exist
(the audited precedent: "adapt the About screen" — no such screen in the code).

Checks:
  E-PATH    a verdict row cites a base-version path that does not exist
  E-VERDICT a verdict row whose action is not one of the four allowed verdicts
  E-CYCLE   two entries each declaring the other as a dependency (unsatisfiable)
  W-NEW     an ESCRIBIR DE CERO row that nevertheless cites a base path
  W-BOX     entry heading without a [ ]/[x] progress checkbox
  W-CLOSURE a BROUGHT file imports a base file that has no verdict row anywhere
  tally     pendiente vs aplicado checkboxes (the apply phase's resume state)

W-CLOSURE — the import-closure check (added 2026-08-04)
-------------------------------------------------------
Born from a real miss: `server.mjs` was brought by nine entries while
`tunnel.mjs`, which it imports, appeared in the book zero times. Bring the
server without it and the server does not start. Same shape for
`tests/helpers/fixture_db.mjs` (three brought suites import it) and for
`client/lib/{activation,engagement}.js`.

The check reads the Graphify graph — auto-discovered at
`<base>/graphify-out/graph.json`, overridable with a third argument. **If no
graph is present the check is skipped silently** and every other check still
runs; the graph is an enhancement, never a hard dependency.

Two limits, stated so nobody credits this check with coverage it lacks:

  1. It only follows edges OUT OF files the book already brings. A file the
     book never mapped at all has no edge to follow from, so this check cannot
     see it. That is exactly how the generator `pdf-form-spec.mjs` was missed —
     a `docs/` deliverable whose generator lives in `production/webapp/`. Guard
     that class by surveying the directory that BUILDS an artefact, not only
     the one that STORES it.
  2. It sees static imports only. Measured on the base: `start.mjs` reports
     zero dependencies while doing `await import('./tunnel.mjs')` at line 251.
     Dynamic imports are invisible to the AST graph — the same blind spot that
     already hides contracts living in data files. Close both with Grep.

Usage:  python validate_actions.py action-book.md base-repo [graph.json]
"""

import collections
import json
import os
import re
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VERDICTS = ("TRAER INTACTO", "TRAER MODIFICADO", "ESCRIBIR DE CERO", "NO TRAER")
BROUGHT = ("TRAER INTACTO", "TRAER MODIFICADO")
PATH_RE = re.compile(r"`([^`\n]+?\.[a-zA-Z0-9]{1,6})`")   # backticked file paths
HEAD_RE = re.compile(r"^## .+?—.*$")
IMPORT_RELS = ("imports", "imports_from")

# E-CYCLE — entry ids and the dependency line they declare. Ids look like
# `A-01 bis`, `C-13`, `E-01`; the optional ✅ prefix marks a closed entry.
ENTRY_ID_RE = re.compile(r"^## (?:✅ )?([A-Z]-\d+(?: bis| ter)?) ")
ENTRY_REF_RE = re.compile(r"\b([A-Z]-\d+(?: bis)?)\b")
DEPENDS_PREFIX = "**Depende de:**"


def load_imports(base, graph_path):
    """file -> set(files it statically imports), both base-relative.

    Returns an empty mapping when no graph is available, which makes the
    caller's W-CLOSURE pass a no-op rather than an error.
    """
    if not graph_path:
        graph_path = os.path.join(base, "graphify-out", "graph.json")
    if not os.path.exists(graph_path):
        return {}, None
    try:
        with open(graph_path, encoding="utf-8") as fh:
            graph = json.load(fh)
    except (OSError, ValueError):
        return {}, None

    # Graph paths carry the base directory as a prefix; strip it so they match
    # the book's rows, which are written relative to the base.
    prefix = os.path.basename(os.path.normpath(base)) + "/"
    node_file = {}
    for node in graph.get("nodes", ()):
        src = (node.get("source_file") or "").replace("\\", "/")
        if src.startswith(prefix):
            src = src[len(prefix):]
        node_file[node.get("id")] = src

    imports = collections.defaultdict(set)
    for link in graph.get("links", ()):
        if link.get("relation") not in IMPORT_RELS:
            continue
        src = node_file.get(link.get("source"), "")
        dst = node_file.get(link.get("target"), "")
        if src and dst and src != dst:
            imports[src].add(dst)
    return imports, graph_path


def find_cycles(deps):
    """Every pair of entries that declare each other as a dependency.

    Direct 2-cycles only, which is the shape this has actually taken. Longer
    rings would need a full DFS; they have not appeared, and claiming coverage
    for them would be exactly the kind of overstatement this kit refuses.
    """
    cycles = set()
    for a, ds in deps.items():
        for b in ds:
            if a in deps.get(b, ()):
                cycles.add(tuple(sorted((a, b))))
    return sorted(cycles)


def main(book, base, graph_path=None):
    lines = open(book, encoding="utf-8").read().split("\n")
    errors, warnings = [], []
    pend = done = 0
    brought = {}        # base-relative path -> first line that brings it
    mentioned = set()   # every path carrying any verdict at all
    deps = {}           # entry id -> entries it declares a dependency on
    entry_line = {}     # entry id -> the line its heading is on
    current = None      # the entry whose body we are inside

    for n, l in enumerate(lines, 1):
        if HEAD_RE.match(l):
            head = ENTRY_ID_RE.match(l)
            current = head.group(1) if head else None
            if current:
                entry_line[current] = n
            if "[x]" in l.lower():
                done += 1
            elif "[ ]" in l:
                pend += 1
            else:
                warnings.append(f"W-BOX     line {n}: entry heading has no [ ]/[x] checkbox")
            continue

        # E-CYCLE — the dependency map must be a DAG or the book's ONE promise,
        # "apply top to bottom, dependencies first", is unusable. Read only the
        # part BEFORE "Lo consumen"/"Tests que": what follows is the INVERSE list
        # and counting it manufactures cycles that do not exist.
        if current and l.startswith(DEPENDS_PREFIX):
            head_txt = re.split(r"\*\*Lo consumen:|\*\*Tests que", l)[0]
            deps[current] = sorted({d for d in ENTRY_REF_RE.findall(head_txt) if d != current})
            current = None
            continue

        # verdict table rows: | piece | ACTION | how |
        row = re.match(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$", l)
        if not row or row.group(2).strip("* ") in ("Acción", "---", ""):
            continue
        action = row.group(2).strip("* ")
        if not any(v in action for v in VERDICTS):
            if re.search(r"[A-ZÁÉÍÓÚ]{4,}", action):   # looks like it meant to be one
                errors.append(f"E-VERDICT line {n}: '{action}' is not one of {VERDICTS}")
            continue
        paths = PATH_RE.findall(row.group(1))
        mentioned.update(paths)
        if "ESCRIBIR DE CERO" in action:
            # Only a path that EXISTS in the base is suspicious — that is a seed
            # the row may have meant to bring. Citing the NEW file this row
            # creates is not a mistake: it is the declaration the apply phase's
            # careo (validate_applied.py) reads to tell "written by decision"
            # from "crossed by inertia". Flagging those made the two validators
            # pull in opposite directions.
            seeds = [p for p in paths if os.path.exists(os.path.join(base, p))]
            if seeds:
                warnings.append(f"W-NEW     line {n}: ESCRIBIR DE CERO cites base "
                                f"path(s) {seeds} — seed or mistake?")
            continue
        for p in paths:
            if not os.path.exists(os.path.join(base, p)):
                errors.append(f"E-PATH    line {n}: `{p}` not found under {base}")
            elif any(v in action for v in BROUGHT):
                brought.setdefault(p, n)

    # E-CYCLE — two entries naming each other as a dependency wait on each other
    # forever, and the apply phase simply stops. Found three times in one session
    # (B-08 <-> A-09, D-01 <-> D-12, D-09 <-> D-12), each one invisible to every
    # other check here because each entry reads perfectly well on its own.
    for a, b in find_cycles(deps):
        errors.append(f"E-CYCLE   `{a}` (line {entry_line.get(a, '?')}) and "
                      f"`{b}` (line {entry_line.get(b, '?')}) each declare the other as a "
                      f"dependency — the apply order cannot be satisfied")

    # W-CLOSURE — every import of a brought file must itself carry a verdict.
    imports, used_graph = load_imports(base, graph_path)
    gaps = collections.defaultdict(list)
    for path, line_no in brought.items():
        for dep in imports.get(path, ()):
            if dep in mentioned or not os.path.exists(os.path.join(base, dep)):
                continue
            gaps[dep].append((path, line_no))
    for dep in sorted(gaps):
        users = sorted(gaps[dep])
        shown = ", ".join(f"`{u}` (line {n})" for u, n in users[:3])
        more = f" +{len(users) - 3} more" if len(users) > 3 else ""
        warnings.append(f"W-CLOSURE `{dep}` has no verdict row — imported by "
                        f"{shown}{more}")

    print(f"validate_actions: {book}  (base: {base})")
    print(f"  entries: {pend + done} · pendiente: {pend} · aplicado: {done}")
    if used_graph:
        print(f"  closure: {len(brought)} brought file(s) checked against {used_graph}")
    else:
        print("  closure: SKIPPED — no graph found (W-CLOSURE inactive)")
    for e in errors:
        print("  " + e)
    for w in warnings:
        print("  " + w)
    print(f"  RESULT: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        sys.exit(2)
    main(*sys.argv[1:])
