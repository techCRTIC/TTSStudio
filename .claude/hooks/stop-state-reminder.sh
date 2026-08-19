#!/bin/bash
# Claude Code Stop hook — Personal AI Dev Studio
# Enforces the "file is the memory" invariant (design principles § insight 3):
# if project files changed after production/session-state/active.md was last
# updated, block the stop once and ask Claude to persist session state first.
#
# Safe by construction:
#   - stop_hook_active guard prevents infinite block loops
#   - exits silently in projects that have no state file (e.g. the harness repo)

INPUT=$(cat 2>/dev/null)

# Every "reason" this hook emits is a JSON string, and several of them interpolate
# text read from project files (headings, file paths). Stripping quotes is NOT
# enough: a single backslash — and Windows paths are full of them — makes the
# payload unparseable, so the consumer drops it and THE BLOCK NEVER HAPPENS. A
# guard that fails open is worse than no guard, because nobody notices. Escape
# backslash FIRST (or the escaping escapes its own escapes), then the quote, then
# drop control characters, which JSON forbids raw.
json_escape() {
    tr '\n' ' ' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\000-\037'
}

# Anchor to the project root — hooks can inherit whatever cwd the session's
# shell last visited (e.g. a worktree), which produces false positives.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Never loop: if this stop is already a continuation caused by a stop hook, allow it.
if echo "$INPUT" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
    exit 0
fi

STATE_FILE="production/session-state/active.md"
LOG_FILE="directives/session-log.md"

# --- Invariant 1: session state freshness ('file is the memory') ---
if [ -f "$STATE_FILE" ]; then
    # Only nudge when meaningful project files are newer than the state file.
    # Exclude VCS internals, caches, build artifacts, worktrees, and audit logs.
    #
    # -prune, NOT -not -path: a -not -path filter still DESCENDS into the
    # directory and tests every file inside it, so a node_modules with 40k files
    # was being walked in full. This hook has a 10s timeout, and a find that
    # times out fails SILENTLY — the invariant would stop existing on exactly
    # the large projects where it matters most. -prune skips the subtree whole.
    NEWER=$(find . \
        \( -name .git \
        -o -name node_modules \
        -o -name .venv \
        -o -name venv \
        -o -name __pycache__ \
        -o -name .pytest_cache \
        -o -name .mypy_cache \
        -o -name .ruff_cache \
        -o -name dist \
        -o -name build \
        -o -name .next \
        -o -name .nuxt \
        -o -name .turbo \
        -o -name .cache \
        -o -name coverage \
        -o -name target \
        -o -name graphify-out \
        -o -path ./.tmp \
        -o -path ./production/session-logs \
        -o -path ./.claude/worktrees \
        \) -prune -o \
        -type f -newer "$STATE_FILE" -print \
        2>/dev/null | head -5 | json_escape)
    if [ -n "$NEWER" ]; then
        cat <<EOF
{"decision": "block", "reason": "Project files changed after production/session-state/active.md was last updated. Per the 'file is the memory' invariant, persist session state before finishing: (1) refresh the '<!-- cierre -->' closing-summary block at the TOP of the newest entry in directives/session-log.md so it tells the next session, in plain Spanish, what this session actually did/decided/left pending — the SessionStart hook injects that block as the next session's first context; (2) update the detailed state in active.md below (current task, key decisions, next steps). Changed files include: $NEWER"}
EOF
        exit 0
    fi

    # --- Invariant 1-bis: session-log.md carries a closing-summary block ---
    # The closing summary now lives at the TOP of each session-log.md entry, and
    # the SessionStart hook injects the newest one verbatim as the next session's
    # first impression. Without any cierre block the preview falls back to a raw
    # head of active.md. ASCII sentinels keep the check locale-proof; the heading
    # inside them is free-form Spanish.
    if ! grep -q '<!-- /cierre -->' "$LOG_FILE" 2>/dev/null; then
        cat <<EOF
{"decision": "block", "reason": "directives/session-log.md has no closing-summary block, and the SessionStart hook injects the newest one as the next session's first context. Add it at the TOP of the newest entry (directly under its '## YYYY-MM-DD — título' heading), fenced by the sentinels '<!-- cierre -->' and '<!-- /cierre -->': a Spanish heading with session number + date, a one-sentence 'En una frase:', 3-6 plain-language bullets of what was done, the decisions taken and WHY, the state at close (branch, tree, tests, what is half-done), and the concrete next step. Detailed but simple — no internal jargon or code identifiers the reader has to look up. See CLAUDE.md § Living documentation."}
EOF
        exit 0
    fi

    # --- Invariant 1-ter: the cierre sentinels are BALANCED and ALTERNATING ---
    # Invariant 1-bis only asks whether SOME '<!-- /cierre -->' exists, and the
    # SessionStart hook seds from the FIRST opening to the FIRST closing. Both are
    # individually correct, and together they are blind to a real failure mode:
    # rewriting a cierre block can leave the previous draft below it WITH ITS OWN
    # CLOSING SENTINEL. The file then carries two contradictory summaries for the
    # same session — different test counts, one claiming a passed security review
    # and the superseded one saying it is still pending — plus an unpaired
    # sentinel waiting for the next entry to be prepended on top of it.
    #
    # Nothing breaks when this happens. The injected block is still the right one,
    # and this hook still passes. THE MACHINERY IS FINE AND THE RECORD IS WRONG,
    # and a signed contradictory summary in git history is exactly what a future
    # reader trusts instead of re-deriving. The one time it occurred it was caught
    # by git-lead REFUSING TO COMMIT IT — by a person reading, not by a guard
    # firing. This is that guard.
    #
    # Cheap and total: openings and closings must be equal in number and must
    # strictly alternate O,C,O,C,... Any orphan, duplicate or nested sentinel
    # breaks one of the two conditions.
    if [ -f "$LOG_FILE" ]; then
        # One token per sentinel, in file order: O for open, C for close.
        SENTINELS=$(grep -o '<!-- /\{0,1\}cierre -->' "$LOG_FILE" 2>/dev/null \
            | sed -e 's|<!-- cierre -->|O|' -e 's|<!-- /cierre -->|C|' \
            | tr -d '\n')
        N_OPEN=$(printf '%s' "$SENTINELS" | tr -cd 'O' | wc -c | tr -d ' ')
        N_CLOSE=$(printf '%s' "$SENTINELS" | tr -cd 'C' | wc -c | tr -d ' ')
        # Strict alternation starting with O <=> the string is exactly (OC)*.
        BALANCED=$(printf '%s' "$SENTINELS" | sed 's/\(OC\)*//')
        if [ "$N_OPEN" != "$N_CLOSE" ] || [ -n "$BALANCED" ]; then
            cat <<EOF
{"decision": "block", "reason": "directives/session-log.md has malformed cierre sentinels: $N_OPEN '<!-- cierre -->' vs $N_CLOSE '<!-- /cierre -->', and they must be equal in number and strictly alternate (open, close, open, close...). Sequence found: $SENTINELS. The usual cause is rewriting a closing summary and leaving the previous draft below it with its own closing sentinel — which produces TWO contradictory summaries for the same session plus an orphan sentinel. Neither the SessionStart injection nor the check above can see this: the injection seds from the FIRST opening to the FIRST closing, so a stale duplicate underneath is invisible, and a signed contradictory summary is precisely what a future reader trusts instead of re-deriving. Fix: keep exactly one cierre block per session entry, delete the superseded draft entirely (not just its sentinel), and verify the newest entry's block is the FIRST in the file. NOTE: quoting a sentinel literally in prose ALSO trips this check — the count is over bytes, and backticks do not exempt it. Refer to it as 'the closing sentinel' instead of reproducing it."}
EOF
            exit 0
        fi
    fi

    # --- Invariant 1-quater: active.md is STATE, not a second chronology ---
    # CLAUDE.md defines active.md as the detailed, machine-recoverable session
    # state, and /close step 4 says "reescribe, no añadas". That rule is easy to
    # break in a way that looks tidy: instead of deleting the finished session,
    # demote it to a '## 📕 Sesión anterior (Nª)' heading and write the new one on
    # top. Done every close, the file becomes mostly archive — a duplicate of
    # session-log.md written for the wrong reader.
    #
    # The cost is not hypothetical. Past a few thousand lines active.md EXCEEDS
    # THE READ LIMIT, and the session it was supposed to bootstrap starts on a
    # fraction of it: the file whose whole job is fast recovery becomes too big to
    # read. It cannot simply be truncated either, because by then some numbers
    # exist ONLY there.
    #
    # This needs a guard rather than another sentence in the docs, because each
    # close copies the pattern it finds in the file over the rule written
    # elsewhere. The accreted heading is the signal; the line count is the backstop.
    STATE_MAX_LINES=400
    ARCHIVE_HEADING=$(grep -nEi '^#{1,6} .*sesi.{0,2}n anterior' "$STATE_FILE" 2>/dev/null \
        | head -3 | json_escape)
    if [ -n "$ARCHIVE_HEADING" ]; then
        cat <<EOF
{"decision": "block", "reason": "production/session-state/active.md has grown archive headings — it is being used as a second chronology instead of as live state. Found: $ARCHIVE_HEADING. active.md holds ONLY the current session; a finished session is summarised into directives/session-log.md (newest entry on top) and then DELETED from here — /close step 4 is 'reescribe, no añadas'. Left unchecked this file grows until it exceeds the read limit at session start, which is the exact failure this guard exists to prevent. Fix: for each 'Sesión anterior' section, migrate anything that lives ONLY there into that session's entry in session-log.md (measurements, decisions, gotchas — this is careful work, not a cat), then delete the section."}
EOF
        exit 0
    fi
    STATE_LINES=$(wc -l < "$STATE_FILE" 2>/dev/null | tr -d ' ')
    case "$STATE_LINES" in
        ''|*[!0-9]*) STATE_LINES=0 ;;
    esac
    if [ "$STATE_LINES" -gt "$STATE_MAX_LINES" ]; then
        cat <<EOF
{"decision": "block", "reason": "production/session-state/active.md is $STATE_LINES lines, over the $STATE_MAX_LINES-line ceiling. It is live state for ONE session (target ~250 lines: current task, exact commands, paths, ports, versions), not a chronology — the chronology is directives/session-log.md. Past this size it stops doing its only job: a file that exceeds the read limit leaves the next session running on a fraction of it. Fix: move whatever is finished into the corresponding entry of session-log.md and rewrite this file down to the current session. If the current session genuinely needs more than $STATE_MAX_LINES lines of live state, that is a signal the detail belongs in a runbook next to the code (e.g. execution/<module>/README.md), which survives the next rewrite."}
EOF
        exit 0
    fi
fi

# --- Invariant 2: roadmap checkpoint ---
# Once the idea+investigation phase closes — a foundational decision (an ADR)
# exists but the programming roadmap is still a skeleton — nudge the orchestrator
# to PROPOSE a roadmap to the user. The scaffolded directives/roadmap.md carries a
# 'roadmap-checkpoint: pending' sentinel; flipping it to 'done' (user accepts and
# the roadmap is filled) or 'declined' silences this. Fires until resolved.
ROADMAP="directives/roadmap.md"
if [ -f "$ROADMAP" ] && grep -q "roadmap-checkpoint: pending" "$ROADMAP" 2>/dev/null; then
    ADR=$(find . -name "ADR-*.md" \
        -not -path "./.git/*" \
        -not -path "./node_modules/*" \
        -not -path "./.claude/*" \
        -not -path "./.tmp/*" \
        2>/dev/null | head -1 | json_escape)
    if [ -n "$ADR" ]; then
        cat <<EOF
{"decision": "block", "reason": "A foundational decision exists ($ADR) but directives/roadmap.md is still a skeleton — the idea+investigation phase looks closed. Propose a programming roadmap to the user now (AskUserQuestion covering fases + alcances/scope). When the user accepts (you fill roadmap.md) or declines, flip the 'roadmap-checkpoint: pending' sentinel in roadmap.md to 'done'/'declined' so this stops firing."}
EOF
        exit 0
    fi
fi

exit 0
