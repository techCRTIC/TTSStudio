#!/usr/bin/env bash
# .claude/hooks/lib/payload.sh — shared hook-payload helpers.
#
# Every hook receives its event payload as JSON on stdin. Pulling one field out
# of that JSON was copy-pasted into four hooks with three different bugs; this
# is the single implementation.
#
# Usage:
#   LIB="${CLAUDE_PROJECT_DIR:-.}/.claude/hooks/lib/payload.sh"
#   [ -f "$LIB" ] && . "$LIB"
#   PAYLOAD=$(cat 2>/dev/null)
#   COMMAND=$(payload_field "$PAYLOAD" tool_input.command)
#
# Callers MUST guard the source and degrade gracefully — a hook that dies
# because this file is missing would block every tool call in a partially
# copied harness.
#
# Extraction degrades: python -> python3 -> py -3 -> grep. On Windows Git Bash
# "python" is frequently absent from PATH and jq is not guaranteed, so the grep
# fallback has to stand on its own for top-level string fields.

payload_field() {
    local json="$1" path="$2" py out
    for py in "python" "python3" "py -3"; do
        command -v ${py%% *} >/dev/null 2>&1 || continue
        # Writes BYTES, not text, and deliberately emits no trailing newline.
        # On Windows, print() goes through a text-mode stdout that rewrites
        # every \n as \r\n — so a multiline command came back with a CR glued
        # to the end of each line, and `cat\r` is not `cat` to any rule that
        # anchors on token boundaries. Same failure as the undecoded \n in the
        # grep fallback below, except this path is the one that runs every day.
        # Regression-tested by tests/test-payload.sh.
        out=$(printf '%s' "$json" | $py -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(1)
for key in sys.argv[1].split("."):
    if not isinstance(d, dict):
        sys.exit(0)
    d = d.get(key)
    if d is None:
        sys.exit(0)
s = d if isinstance(d, str) else json.dumps(d)
try:
    sys.stdout.buffer.write(s.encode("utf-8"))
except AttributeError:
    sys.stdout.write(s)
' "$path" 2>/dev/null) || continue
        # A successful parse that yields nothing is authoritative: the field is
        # genuinely absent. Only fall through when no interpreter could parse at
        # all — otherwise a missing field would silently hit the fuzzy fallback.
        printf '%s' "$out"
        return 0
    done

    # Last resort: raw-match the final path segment as a top-level string field.
    # Loses nesting; acceptable, since the fields hooks actually need
    # ("prompt", "command", "agent_type") are string-valued.
    #
    # The second sed is NOT cosmetic. JSON carries newlines
    # as the two characters \ and n; leaving them undecoded means a multiline
    # command reaches the hooks as one long line, and every rule anchored at
    # start-of-token stops matching — `cat` preceded by a literal "n" is not a
    # `cat`. Measured with PATH cut down to /usr/bin:/bin, that silently turned
    # OFF the secret-read rule for any multiline command. This path only runs
    # when no interpreter exists at all, which is precisely the environment the
    # docstring above promises it will survive.
    #
    # Order is load-bearing: \\ must be decoded LAST, or it would re-interpret
    # the backslashes the earlier substitutions just produced.
    local leaf="${path##*.}"
    printf '%s' "$json" \
        | grep -oE "\"$leaf\"[[:space:]]*:[[:space:]]*\"(\\\\.|[^\"\\\\])*\"" \
        | head -1 \
        | sed "s/^\"$leaf\"[[:space:]]*:[[:space:]]*\"//; s/\"\$//" \
        | sed -e 's/\\"/"/g' -e 's/\\n/\n/g' -e 's/\\t/\t/g' -e 's/\\r//g' -e 's/\\\//\//g' -e 's/\\\\/\\/g'
}
