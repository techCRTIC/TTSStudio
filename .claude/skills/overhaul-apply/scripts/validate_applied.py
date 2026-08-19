#!/usr/bin/env python3
"""Declared-vs-real validator for Overhaul Kit apply phases.

Read-only, pure stdlib (+ git). Exit 1 on errors.

The kit machine-checks the decision book (validate_book) and the action book
(validate_actions) — but its CORE invariant, "the new codebase only ever
contains code that an audited decision put there" (overhaul-apply, phase 3),
was enforced by eyes alone. Eyes are the one instrument this kit's own
doctrine rejects. This closes the loop: it compares what the action book
DECLARES against what the repo ACTUALLY contains/changed, via git.

Three buckets, the third is the one that matters:

  declared and present/changed   -> fine, silent
  declared, checked [x], absent  -> W-UNDONE  (checked off, file never landed)
  present/changed, NOT declared  -> E-UNDECLARED (crossed by inertia — the
                                    exact channel phase 3 exists to close)

Checks:
  E-UNDECLARED  a file exists (or changed) that no verdict row accounts for
  E-BROUGHT     a NO TRAER path exists in the new repo anyway
  W-UNDONE      an entry marked [x] whose brought/written file is absent
  W-EARLY       a file declared ONLY by pending [ ] entries already changed
  W-STALE       (--base only) an entry marked [x] none of whose files appear
                in the diff window — usually a wrong --base, not a lie

Modes:
  no --base   FULL-TREE careo: every tracked file must be declared or exempt.
              The purest form of the invariant; use at phase-3 exit.
  --base REF  DIFF careo: only files changed since REF (plus dirty/untracked)
              must be accounted for. Use per-session or per-branch.

Declarations are read from the action book's verdict rows (col 1 = piece,
col 2 = verdict), same parsing contract as validate_actions.py. A backticked
piece ending in `/` or containing `**` declares a PREFIX, covering everything
under it. Living docs, session state and the books themselves are exempt
(EXEMPT below; extend per-run with repeated --exempt PREFIX).

Usage:  python validate_applied.py action-book.md new-repo [--base REF]
                                   [--exempt PREFIX]...
"""

import collections
import os
import re
import subprocess
import sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VERDICTS = ("TRAER INTACTO", "TRAER MODIFICADO", "ESCRIBIR DE CERO", "NO TRAER")
EXPECTED = ("TRAER INTACTO", "TRAER MODIFICADO", "ESCRIBIR DE CERO")
PATH_RE = re.compile(r"`([^`\n]+?\.[a-zA-Z0-9]{1,6})`")     # backticked file paths
PREFIX_RE = re.compile(r"`([^`\n]+?)(?:\*\*`|/`)")          # `dir/**` or `dir/`
ENTRY_RE = re.compile(r"^## ([A-Z]-\d+(?:\s?(?:bis|ter))?)\b.*?(\[[x ~]\])", re.I)
ROW_RE = re.compile(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|")

# Not product code: the harness, the living docs, the session state, and the
# books themselves. The careo is about what CROSSES INTO THE PRODUCT.
EXEMPT = (
    ".claude/", ".tmp/", "directives/", "memory/",
    "production/session-state/", "production/session-logs/",
    "CLAUDE.md", "AGENTS.md", "GEMINI.md",
    ".gitignore", ".gitattributes",
)
BOOK_RE = re.compile(r"docs/.*(decision|action)-book.*")


def norm(p):
    """Forward slashes, strip a leading ./ — as a PREFIX, never lstrip:
    lstrip("./") is character-based and eats the dot off `.puppeteerrc.cjs`."""
    p = p.replace("\\", "/")
    return p[2:] if p.startswith("./") else p


def sh(repo, *args):
    out = subprocess.run(["git", "-C", repo, *args], capture_output=True,
                         text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {out.stderr.strip()}")
    return [l.strip() for l in out.stdout.splitlines() if l.strip()]


def parse_book(book):
    """-> (declared: path -> [(entry_id, state, verdict)], prefixes: [(prefix, entry, state)])"""
    declared = collections.defaultdict(list)
    prefixes = []
    entry, state = None, None
    for line in open(book, encoding="utf-8"):
        head = ENTRY_RE.match(line)
        if head:
            entry, state = head.group(1), head.group(2)
            continue
        if line.startswith("## "):          # non-entry heading: legend, maps
            entry, state = None, None
            continue
        row = ROW_RE.match(line)
        if not row:
            continue
        action = row.group(2).strip("* ")
        verdict = next((v for v in VERDICTS if v in action), None)
        if verdict is None:
            continue
        piece = row.group(1)
        paths = [norm(p) for p in PATH_RE.findall(piece)]
        # A row may cite siblings in shorthand: `production/webapp/package.json`
        # + `.puppeteerrc.cjs` means BOTH live in production/webapp/. Resolve a
        # bare name against the directory of the row's first qualified path.
        dirs = [p.rsplit("/", 1)[0] for p in paths if "/" in p]
        for p in paths:
            if "/" not in p and dirs:
                p = dirs[0] + "/" + p
            declared[p].append((entry or "?", state or "[?]", verdict))
        for p in PREFIX_RE.findall(piece):
            prefixes.append((norm(p).rstrip("/") + "/", entry or "?", state or "[?]"))
    return declared, prefixes


def is_exempt(path, extra):
    return (any(path.startswith(e) or path == e.rstrip("/") for e in EXEMPT + tuple(extra))
            or BOOK_RE.match(path))


def main(argv):
    pos, base, extra_exempt = [], None, []
    it = iter(argv[1:])
    for a in it:
        if a == "--base":
            base = next(it, None)
        elif a == "--exempt":
            extra_exempt.append(next(it, "").rstrip("/") + "/")
        else:
            pos.append(a)
    if len(pos) != 2:
        print(__doc__)
        return 2
    book, repo = pos

    declared, prefixes = parse_book(book)

    def covered(path):
        if path in declared:
            return declared[path]
        hits = [(e, s, "PREFIX") for pre, e, s in prefixes if path.startswith(pre)]
        return hits

    # --- the real side -------------------------------------------------------
    if base:
        changed = set(sh(repo, "diff", "--name-only", base, "HEAD"))
        changed |= {l.split(None, 1)[1].strip('"') for l in
                    sh(repo, "status", "--porcelain") if len(l.split(None, 1)) == 2}
        mode = f"diff since {base}"
    else:
        changed = set(sh(repo, "ls-files"))
        mode = "full tree"
    changed = {c.replace("\\", "/") for c in changed}

    errors, warnings = [], []

    # E-UNDECLARED — the inertia channel
    undeclared = sorted(c for c in changed
                        if not covered(c) and not is_exempt(c, extra_exempt))
    by_dir = collections.defaultdict(list)
    for c in undeclared:
        by_dir[c.split("/")[0] if "/" in c else "(root)"].append(c)
    for d in sorted(by_dir):
        files = by_dir[d]
        shown = " · ".join(files[:3]) + (f" +{len(files) - 3} more" if len(files) > 3 else "")
        errors.append(f"E-UNDECLARED {len(files)} file(s) under {d}/ with no verdict row: {shown}")

    # E-BROUGHT — NO TRAER that crossed anyway
    for path, uses in sorted(declared.items()):
        verds = {v for _, _, v in uses}
        if "NO TRAER" in verds and not (verds & set(EXPECTED)):
            if os.path.exists(os.path.join(repo, path)):
                entries = ", ".join(sorted({e for e, _, v in uses if v == "NO TRAER"}))
                errors.append(f"E-BROUGHT    `{path}` is NO TRAER ({entries}) but exists in the repo")

    # W-UNDONE / W-STALE / W-EARLY — per-entry accounting
    entry_paths = collections.defaultdict(list)
    for path, uses in declared.items():
        for e, s, v in uses:
            entry_paths[(e, s)].append((path, v))
    for (e, s), pv in sorted(entry_paths.items()):
        expected = [p for p, v in pv if v in EXPECTED]
        if s.lower() == "[x]":
            missing = [p for p in expected if not os.path.exists(os.path.join(repo, p))]
            for p in missing:
                warnings.append(f"W-UNDONE     {e} is [x] but `{p}` does not exist in the repo")
            if base and expected and not missing and not (set(expected) & changed):
                warnings.append(f"W-STALE      {e} is [x] but none of its {len(expected)} file(s) "
                                f"changed since {base} — wrong --base?")
    # W-EARLY only makes sense against a diff window: in full-tree mode every
    # existing file counts as "changed", and files legitimately ported early
    # (with their modifying entries still pending) would all fire.
    if base:
        for c in sorted(changed):
            uses = covered(c)
            if uses and all(s == "[ ]" for _, s, *_ in uses):
                entries = ", ".join(sorted({e for e, _, *_ in uses}))
                warnings.append(f"W-EARLY      `{c}` changed but is declared only by pending {entries}")

    # --- report --------------------------------------------------------------
    print(f"validate_applied: {book}")
    print(f"  repo: {repo} · mode: {mode}")
    print(f"  declared: {len(declared)} path(s) + {len(prefixes)} prefix(es) · "
          f"real side: {len(changed)} file(s)")
    for e in errors:
        print("  " + e)
    for w in warnings:
        print("  " + w)
    print(f"  RESULT: {len(errors)} error(s), {len(warnings)} warning(s)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
