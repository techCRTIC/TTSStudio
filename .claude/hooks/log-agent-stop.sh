#!/bin/bash
# Claude Code SubagentStop hook — Personal AI Dev Studio
# Closes the audit-trail entry opened by the SubagentStart hook (log-agent.sh).

# Anchor to the project root — never rely on the inherited cwd.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

LOG_DIR="production/session-logs"
LOG_FILE="$LOG_DIR/agent-audit.log"

mkdir -p "$LOG_DIR" 2>/dev/null

INPUT=$(cat 2>/dev/null)

# JSON extraction with graceful degradation: python -> python3 -> py -3 -> grep.
# On Windows Git Bash, "python" is not always on PATH.
extract_agent_type() {
    local PY
    for PY in "python" "python3" "py -3"; do
        if command -v ${PY%% *} >/dev/null 2>&1; then
            local out
            out=$(echo "$INPUT" | $PY -c "import sys, json; d=json.load(sys.stdin); print(d.get('agent_type', ''))" 2>/dev/null)
            if [ -n "$out" ]; then
                echo "$out"
                return
            fi
        fi
    done
    echo "$INPUT" | grep -oE '"agent_type"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"\([^"]*\)"$/\1/'
}

AGENT_TYPE=$(extract_agent_type)
AGENT_TYPE=${AGENT_TYPE:-unknown}

TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[$TIMESTAMP] SUBAGENT_STOP agent=$AGENT_TYPE" >> "$LOG_FILE"

exit 0
