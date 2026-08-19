#!/bin/bash
# Claude Code PostCompact hook — Personal AI Dev Studio

# Anchor to the project root — never rely on the inherited cwd.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "=== POST-COMPACT RECOVERY — Personal AI Dev Studio ==="

STATE_FILE="production/session-state/active.md"
if [ -f "$STATE_FILE" ]; then
    echo "Re-loading session state from: $STATE_FILE"
    echo ""
    head -30 "$STATE_FILE" 2>/dev/null
    echo ""
    echo "(Read the full state file to recover details that were compacted away.)"
fi

echo "=== END POST-COMPACT RECOVERY ==="
exit 0