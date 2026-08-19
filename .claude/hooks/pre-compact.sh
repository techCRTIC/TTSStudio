#!/bin/bash
# Claude Code PreCompact hook — Personal AI Dev Studio
# Dumps full state before lossy context compression.

# Anchor to the project root — never rely on the inherited cwd.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

echo "=== PRE-COMPACT STATE DUMP — Personal AI Dev Studio ==="
echo "Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo ""

STATE_FILE="production/session-state/active.md"
if [ -f "$STATE_FILE" ]; then
    echo "=== Full session state ==="
    cat "$STATE_FILE"
    echo ""
fi

echo "=== Git status ==="
git status --short 2>/dev/null || echo "(not a git repo)"
echo ""

echo "=== Recently modified files (last 30 min) ==="
find . -type f -mmin -30 -not -path "./.git/*" -not -path "./node_modules/*" 2>/dev/null | head -20

echo ""
echo "=== END PRE-COMPACT DUMP ==="
exit 0
