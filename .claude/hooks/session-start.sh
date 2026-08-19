#!/bin/bash
# Claude Code SessionStart hook — Personal AI Dev Studio
# Loads project context at session start. Outputs context to stdout, which
# Claude sees when a session begins.

# Anchor to the project root — never rely on the inherited cwd.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "=== Personal AI Dev Studio — Session Context ==="

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -n "$BRANCH" ]; then
    echo "Branch: $BRANCH"
    echo ""
    echo "Recent commits:"
    git log --oneline -5 2>/dev/null | while read -r line; do
        echo "  $line"
    done
fi

STATE_FILE="production/session-state/active.md"
LOG_FILE="directives/session-log.md"

# The next session's first impression is the newest closing summary. It lives at
# the TOP of session-log.md (newest entry on top), fenced by ASCII sentinels — so
# the file's FIRST '<!-- cierre -->…<!-- /cierre -->' block is the newest one.
# Inject it verbatim; then point at active.md for the full in-flight detail.
# See CLAUDE.md § Living documentation.
if [ -f "$LOG_FILE" ] && grep -q '<!-- /cierre -->' "$LOG_FILE" 2>/dev/null; then
    echo ""
    echo "=== ACTIVE SESSION STATE DETECTED ==="
    echo "Latest session summary (from $LOG_FILE):"
    echo ""
    # Print the first REAL cierre block: from the first opening sentinel through
    # the first closing sentinel (inclusive), then stop. A real sentinel sits
    # ALONE on its line (anchored ^...$), which skips prose that mentions
    # '<!-- cierre -->' inline; a ``` fence guard skips the format example in the
    # file header. Together the awk lands on the newest entry's actual summary.
    awk '
        /^```/ { fence = !fence; next }
        !fence && /^<!-- cierre -->$/ { f=1 }
        f { print }
        f && !fence && /^<!-- \/cierre -->$/ { exit }
    ' "$LOG_FILE" 2>/dev/null
    echo ""
    if [ -f "$STATE_FILE" ]; then
        TOTAL_LINES=$(wc -l < "$STATE_FILE" 2>/dev/null)
        echo "  ... full in-flight detail (current task, decisions, next steps) is in"
        echo "  $STATE_FILE ($TOTAL_LINES lines) — read it to continue where you left off."
    fi
    echo "=== END SESSION STATE PREVIEW ==="
elif [ -f "$STATE_FILE" ]; then
    # Fallback: no cierre block in session-log.md yet (e.g. predating this
    # contract). Point at active.md and nudge for the missing summary.
    echo ""
    echo "=== ACTIVE SESSION STATE DETECTED ==="
    echo "A previous session left state at: $STATE_FILE"
    echo "Read this file to recover context and continue where you left off."
    echo ""
    echo "NOTE: $LOG_FILE has no '<!-- cierre -->' summary block. Its newest entry"
    echo "must open with one (per CLAUDE.md § Living documentation) — write it when"
    echo "you next update the log."
    echo ""
    TOTAL_LINES=$(wc -l < "$STATE_FILE" 2>/dev/null)
    echo "Quick summary of active.md (first 20 lines):"
    head -20 "$STATE_FILE" 2>/dev/null
    if [ "$TOTAL_LINES" -gt 20 ]; then
        echo "  ... ($TOTAL_LINES total lines — read the full file to continue)"
    fi
    echo "=== END SESSION STATE PREVIEW ==="
fi

MEMORY_INDEX="memory/MEMORY.md"
if [ -f "$MEMORY_INDEX" ]; then
    echo ""
    echo "=== PROJECT MEMORY INDEX ==="
    cat "$MEMORY_INDEX"
    echo "=== END PROJECT MEMORY INDEX ==="
fi

echo "==================================="
echo "Tip: run /start for full guided onboarding (loads CLAUDE.md, directives,"
echo "session-log, project-overview, and lists available skills)."
exit 0
