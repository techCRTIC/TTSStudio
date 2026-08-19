#!/usr/bin/env python3
"""Consistency validator for Overhaul Kit decision books.

Read-only, pure stdlib. Exit 1 on errors, 0 otherwise (warnings allowed).

Every check here maps to a failure that actually happened while maintaining a
decision book by hand (Starmatch V3, sessions 1-2):

  E-COUNT   summary said "17 P0" while the sections added up to 23
  E-GHOST   index rows / summary rows pointing at sections that don't exist
  E-ORPHAN  sections missing from the index
  E-DEADREF prose referencing IDs that were deleted (A-01 cited 6 times after
            being superseded)
  E-DEP     a point whose ONLY delivery vehicle is a lower-priority point —
            B-06 (P0, a legal requirement) was delivered inside D-12 (P1), so
            any scope cut would have silently taken the legal requirement with
            it. Counting can't catch this: both numbers were correct.
  W-TITLE   section titled ABIERTO whose body says "DECIDIDO" (C-11, A-01 bis)
  W-OPEN    the mirror, and the direction that hides risk: a body still carrying
            an open marker while the title says nothing. C-04 sat like that from
            the day it was written — a P0 whose engine design was undecided,
            invisible to anyone reading only titles, while the summary claimed
            the book had exactly one open decision.
  W-ORDER   sections out of numeric order inside a block (D-16 between D-08
            and D-10)
  W-EMOJI   index priority emoji disagreeing with the title's priority label

Usage:  python validate_book.py path/to/decision-book.md
"""

import re
import sys

# Windows consoles default to cp1252; the book is full of emoji. (This exact
# crash once truncated a living doc mid-rewrite. The validator only reads.)
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ID_RE = r"[A-Z]{1,2}-\d{2}(?:\s?(?:bis|ter))?"
SECTION_RE = re.compile(r"^### (" + ID_RE + r")\s*·\s*(.+?)\s*(?:—\s*\*\*(.+?)\*\*)?\s*$")
REF_RE = re.compile(r"\b(" + ID_RE + r")\b")

PRIO_EMOJI = {"P0": "\U0001f534", "P1": "\U0001f7e1", "P2": "⚪",
              "GATE": "\U0001f6aa"}

# A point's delivery vehicle, declared in its own body. Two accepted forms:
#   "🔗 **Se entrega dentro de D-12 y no tiene otro camino.**"
#   "**Entregado por:** D-12"
# The marker is deliberately prose-shaped: the rule it enforces only matters
# when a human wrote down *why* a point has no independent delivery path.
DELIVERED_BY = re.compile(
    r"(?:[Ss]e entrega dentro de|[Ee]ntregado por:?)\s*\*{0,2}(" + ID_RE + r")")
# Escape hatch mirroring the book's own convention (A-01 bis): an inverted
# dependency the user accepted on purpose is recorded, not silently allowed.
RISK_ACCEPTED = re.compile(r"riesgo asumido", re.IGNORECASE)
PRIO_RANK = {"P0": 0, "P1": 1, "P2": 2}

DECIDED_BODY = re.compile(r"^#{2,4} .*(?:✅|DECIDIDO|RESUELTO|ACEPTADO POR EL USUARIO)",
                          re.MULTILINE)
# The mirror of W-TITLE, and the dangerous direction: a body that still carries
# an open marker while the title says nothing about it. C-04 sat like that from
# the day it was written — a launch-blocking point whose engine design was
# undecided, invisible to anyone reading only titles and the summary, which
# meanwhile claimed there was exactly one open decision in the whole book.
OPEN_BODY = re.compile(r"⏳|^#{2,4} .*\bABIERTO\b", re.MULTILINE)
OPEN_TITLE = re.compile(r"⏳|ABIERTO|EN REVISI|SIN CERRAR|POR DEFINIR", re.IGNORECASE)
DECIDED_TITLE = re.compile(r"DECIDIDO|RESUELTO|CERRADO|SUPERADO|DESCARTADO|"
                           r"SIN OBJETO|FUERA DE ALCANCE|REENFOCADO|aceptad",
                           re.IGNORECASE)


def norm(i):
    return re.sub(r"\s+", " ", i.strip())


def main(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    errors, warnings = [], []

    # ---- 1. Collect detail sections (id -> (line_no, title, label, body)) ----
    # A section body ends at the next section OR at the next h1/h2 (a new block,
    # or the summary), whichever comes first. Without the second bound the LAST
    # section swallows the whole "Resumen de prioridades" and inherits its
    # markers — a body-scanning check then fires on the wrong section. (Found
    # 2026-08-03 when an ad-hoc script reported E-01 as carrying an open marker
    # that actually lived in the summary.)
    sections, order = {}, []
    starts = [(n, m) for n, l in enumerate(lines) if (m := SECTION_RE.match(l))]
    blocks = [n for n, l in enumerate(lines) if re.match(r"^#{1,2} [^#]", l)]
    for k, (n, m) in enumerate(starts):
        end = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
        end = min([end] + [b for b in blocks if b > n])
        sid = norm(m.group(1))
        if sid in sections:
            errors.append(f"E-DUP     line {n+1}: section {sid} defined twice")
        sections[sid] = (n + 1, m.group(2), m.group(3) or "", "\n".join(lines[n:end]))
        order.append((sid, n + 1))

    if not sections:
        print(f"validate_book: no '### X-NN ·' sections found in {path}")
        sys.exit(1)

    # ---- 2. Index rows (between 'Índice' and the first '# ' after it) --------
    idx_ids, retired = {}, set()          # id -> (line_no, emoji_cell)
    in_idx = False
    for n, l in enumerate(lines):
        if re.match(r"^## .*(Índice|Indice)", l):
            in_idx = True
            continue
        if in_idx and re.match(r"^## [^#]", l) and "ndice" not in l:
            break
        row = re.match(r"^\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.*?)\s*\|\s*$", l) if in_idx else None
        if not row:
            continue
        cell_ids = [norm(i) for i in REF_RE.findall(row.group(1))]
        if not cell_ids:
            continue
        is_tombstone = "❌" in row.group(3) and re.search(
            r"[Ee]liminad|[Ss]uperad|[Dd]escartad|absorbid", row.group(2))
        for i in cell_ids:
            if is_tombstone and i not in sections:
                retired.add(i)
            else:
                idx_ids[i] = (n + 1, row.group(3))

    # ---- 3. Index <-> sections, both directions ------------------------------
    for i, (n, _) in idx_ids.items():
        if i not in sections:
            errors.append(f"E-GHOST   line {n}: index lists {i} but no section exists")
    for i, (n, *_r) in sections.items():
        if i not in idx_ids:
            errors.append(f"E-ORPHAN  line {n}: section {i} missing from the index")

    # ---- 4. Priority from title vs index emoji -------------------------------
    def title_prio(label):
        for p in ("P0", "P1", "P2"):
            if p in label:
                return p
        return "GATE" if "GATE" in label else None

    for i, (n, _t, label, _b) in sections.items():
        p = title_prio(label)
        if i in idx_ids and p and PRIO_EMOJI[p] not in idx_ids[i][1]:
            # "P0 / GATE" rows may legitimately show the GATE door — allow either.
            if not ("GATE" in label and PRIO_EMOJI["GATE"] in idx_ids[i][1]):
                warnings.append(f"W-EMOJI   line {idx_ids[i][0]}: index emoji for {i} "
                                f"disagrees with title priority {p}")

    # ---- 5. Summary counts ('### P0 — ... (N)') vs reality -------------------
    try:
        s0 = next(n for n, l in enumerate(lines) if re.match(r"^# Resumen", l))
    except StopIteration:
        s0 = None
        warnings.append("W-NOSUM   no '# Resumen de prioridades' heading found")
    if s0 is not None:
        summary = "\n".join(lines[s0:])
        for m in re.finditer(r"^### .*?\b(P0|P1|P2)\b.*?\((\d+)\)", summary, re.MULTILINE):
            bucket, declared = m.group(1), int(m.group(2))
            seg = summary[m.end():]
            nxt = re.search(r"^### ", seg, re.MULTILINE)
            seg = seg[:nxt.start()] if nxt else seg
            # Count only **bold** ids — the list/table convention. Plain refs in
            # explanatory notes ("(→ C-08 bis)") are context, not membership.
            bold = re.compile(r"\*\*(" + ID_RE + r")\*\*")
            found = {norm(i) for i in bold.findall(seg) if norm(i) in sections}
            if len(found) != declared:
                errors.append(f"E-COUNT   summary says {declared} {bucket} but lists "
                              f"{len(found)} real sections: {sorted(found)}")
            # cross-check against titles claiming this bucket
            claimed = {i for i, (_n, _t, lb, _b) in sections.items()
                       if title_prio(lb) == bucket}
            for i in sorted(claimed - found):
                errors.append(f"E-COUNT   {i} titles itself {bucket} but is missing "
                              f"from the {bucket} summary")
            for i in sorted(found - claimed):
                warnings.append(f"W-COUNT   {i} listed under {bucket} in summary but "
                                f"its title says '{sections[i][2]}'")

    # ---- 6. Dead references --------------------------------------------------
    known = set(sections) | retired
    for n, l in enumerate(lines):
        for m in REF_RE.finditer(l):
            i = norm(m.group(1))
            tail = l[m.end():m.end() + 8]
            if i in known or re.match(r"\s*de V2", tail):
                continue
            errors.append(f"E-DEADREF line {n+1}: reference to {i}, which has no "
                          f"section and is not a declared retirement")

    # references to retired IDs outside their declaration rows -> warning
    for n, l in enumerate(lines):
        if re.match(r"^\|", l) or l.startswith("### "):
            continue
        for m in REF_RE.finditer(l):
            if norm(m.group(1)) in retired:
                warnings.append(f"W-RETREF  line {n+1}: prose still references "
                                f"retired id {norm(m.group(1))}")

    # ---- 7. Title status vs body status --------------------------------------
    for i, (n, _t, label, body) in sections.items():
        if "ABIERTO" in label.upper() and DECIDED_BODY.search(body):
            warnings.append(f"W-TITLE   line {n}: {i} titled ABIERTO but its body "
                            f"carries a decided marker — update the title")
        if not label:
            warnings.append(f"W-TITLE   line {n}: {i} has no **status** label at all")
        # The mirror, and the direction that actually hides risk.
        if OPEN_BODY.search(body) and not OPEN_TITLE.search(label):
            warnings.append(f"W-OPEN    line {n}: {i} carries an open marker in its "
                            f"body but its title ('{label}') does not say so — a "
                            f"reader scanning titles and the summary will miss it")

    # ---- 7 bis. Inverted priority dependencies -------------------------------
    # A point delivered inside another point can never be more binding than its
    # vehicle: if the vehicle is cut, the dependant goes with it. Found in the
    # Starmatch V3 audit — B-06 (P0, required by counsel) had no delivery path
    # other than D-12 (P1). Both counts were correct; the book was still wrong.
    for i, (n, _t, label, body) in sections.items():
        dep_p = title_prio(label)
        if dep_p not in PRIO_RANK:
            continue
        for m in DELIVERED_BY.finditer(body):
            vehicle = norm(m.group(1))
            if vehicle == i or vehicle not in sections:
                continue
            veh_p = title_prio(sections[vehicle][2])
            if veh_p not in PRIO_RANK:
                warnings.append(f"W-DEP     line {n}: {i} is delivered inside "
                                f"{vehicle}, which carries no priority label")
                continue
            if PRIO_RANK[dep_p] < PRIO_RANK[veh_p]:
                line_at = n + body[:m.start()].count("\n")
                msg = (f"{i} ({dep_p}) is delivered inside {vehicle} ({veh_p}) — "
                       f"cutting {vehicle} silently cuts {i}")
                if RISK_ACCEPTED.search(body):
                    warnings.append(f"W-DEP     line {line_at}: {msg} "
                                    f"[marked riesgo asumido]")
                else:
                    errors.append(f"E-DEP     line {line_at}: {msg}. Raise "
                                  f"{vehicle} to {dep_p}, give {i} its own "
                                  f"delivery path, or record it as riesgo asumido")

    # ---- 8. Numeric ordering inside each block -------------------------------
    def key(sid):
        m = re.match(r"([A-Z]{1,2})-(\d+)\s?(bis|ter)?", sid)
        return m.group(1), int(m.group(2)), {"": 0, "bis": 1, "ter": 2}[m.group(3) or ""]

    prev = None
    for sid, n in order:
        k = key(sid)
        if prev and k[0] == prev[0][0] and k < prev[0]:
            warnings.append(f"W-ORDER   line {n}: {sid} appears after {prev[1]} — "
                            f"sections must stay sorted inside a block")
        prev = (k, sid)

    # ---- report --------------------------------------------------------------
    print(f"validate_book: {path}")
    print(f"  sections: {len(sections)} · index entries: {len(idx_ids)} · "
          f"retired ids: {len(retired)}")
    for e in errors:
        print("  " + e)
    for w in warnings:
        print("  " + w)
    print(f"  RESULT: {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1])
