#!/bin/bash
# Test harness for .claude/hooks/lib/payload.sh
# Usage: bash test-payload.sh /path/to/lib/payload.sh
#
# payload.sh is not a hook — it is the field extractor every hook depends on,
# so when it degrades, the rules built on top of it degrade silently. It has
# two code paths and until 2026-07-28 only one of them was ever exercised:
# the tests all ran on a machine with Python, so the grep fallback (the path
# the docstring promises will "stand on its own" on Windows Git Bash) was
# never run. It was broken. Hence the restricted-PATH cases below.

LIBFILE="$1"
case "$LIBFILE" in
    /*|[A-Za-z]:*) LIBABS="$LIBFILE" ;;
    *)             LIBABS="$PWD/$LIBFILE" ;;
esac

. "$(dirname "$0")/lib.sh"

RESTRICTED="/usr/bin:/bin"

# check <expected> <json> <path> <desc> [restricted-PATH]
check() {
    local expect="$1" json="$2" path="$3" desc="$4" restrict="$5"
    local got
    if [ -n "$restrict" ]; then
        got=$(env PATH="$restrict" bash -c '. "$1"; payload_field "$2" "$3"' _ "$LIBABS" "$json" "$path" 2>/dev/null)
    else
        got=$(bash -c '. "$1"; payload_field "$2" "$3"' _ "$LIBABS" "$json" "$path" 2>/dev/null)
    fi
    if [ "$got" = "$expect" ]; then
        PASS=$((PASS+1)); printf '  PASS  %s\n' "$desc"
    else
        FAIL=$((FAIL+1))
        printf '  FAIL  %s\n        want [%s]\n        got  [%s]\n' "$desc" "$expect" "$got"
    fi
}

echo "=== NORMAL PATH (an interpreter is available) ==="
check 'ls -la'   '{"tool_input":{"command":"ls -la"}}'        tool_input.command 'nested field'
check 'hola'     '{"prompt":"hola","cwd":"/x/landing"}'       prompt             'top-level field'
check ''         '{"tool_input":{}}'                          tool_input.command 'absent field yields empty'
check ''         'not json at all'                            tool_input.command 'unparseable yields empty'
check 'say "hi"' '{"tool_input":{"command":"say \"hi\""}}'    tool_input.command 'escaped quotes'
check "$(printf 'a\nb')" '{"tool_input":{"command":"a\nb"}}'  tool_input.command 'newline escape'

echo
echo "=== FALLBACK PATH (no interpreter — PATH cut to $RESTRICTED) ==="
if env PATH="$RESTRICTED" sh -c 'command -v python || command -v python3 || command -v py' >/dev/null 2>&1; then
    echo "  SKIP  an interpreter is still reachable under $RESTRICTED —"
    echo "        this environment cannot exercise the fallback."
else
    check 'ls -la' '{"tool_input":{"command":"ls -la"}}'      tool_input.command 'nested field via grep' "$RESTRICTED"
    check 'hola'   '{"prompt":"hola"}'                        prompt             'top-level field via grep' "$RESTRICTED"
    # The regression that mattered: a multiline command arriving as one line
    # un-anchors every start-of-token rule in validate-commit.sh.
    check "$(printf 'echo hola\ncat README.md')" \
                   '{"tool_input":{"command":"echo hola\ncat README.md"}}' \
                   tool_input.command 'newline escape DECODED (was: two literal chars)' "$RESTRICTED"
    check "$(printf 'a\tb')" '{"tool_input":{"command":"a\tb"}}' \
                   tool_input.command 'tab escape decoded' "$RESTRICTED"
    check 'say "hi"' '{"tool_input":{"command":"say \"hi\""}}' \
                   tool_input.command 'escaped quotes' "$RESTRICTED"
    check 'C:\Users\x' '{"tool_input":{"command":"C:\\Users\\x"}}' \
                   tool_input.command 'backslashes decoded LAST, not doubled away' "$RESTRICTED"
    check 'a/b' '{"tool_input":{"command":"a\/b"}}' \
                   tool_input.command 'escaped forward slash' "$RESTRICTED"
fi

result