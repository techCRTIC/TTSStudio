#!/bin/bash
# Shared helpers for the hook test suites (.claude/hooks/tests/test-*.sh).
#
# WHY NO PYTHON HERE (2026-07-28): the suites used to build the hook payload
# with `python -c json.dumps`. On Windows Git Bash, handing a POSIX-looking
# string to a NATIVE python.exe triggers MSYS path conversion, which silently
# rewrote the case `/usr/bin/cat.exe .env` into
# `C:/Program Files/Git/usr/bin/cat.exe .env` — a path with a SPACE in it. The
# hook then tokenized `C:/Program` as the command word and allowed the read.
# The assertion was right and the hook was right; the harness was lying. A test
# harness that mutates its own input is worse than no harness, because it
# manufactures failures that send you debugging the wrong file.
#
# Building the JSON in bash also removes two process spawns per case, but be
# honest about what that bought: MEASURED, it did not move the wall clock. The
# suite is dominated by the hooks themselves — each case spawns a bash, and
# each hook run spawns its own python (lib/payload.sh) plus several
# sed/grep/awk. On Windows those spawns cost ~1s per case, so ~115 cases run in
# a couple of minutes no matter what this harness does.
#
# That runtime is the price of testing hooks end-to-end instead of testing
# their regexes in isolation, and it is worth paying — but it means the suite
# belongs at session close (/close step 8), not in a tight edit loop.

PASS=0; FAIL=0

# Minimal JSON string escaping — enough for shell command strings.
json_escape() {
    local s=$1
    s=${s//\\/\\\\}
    s=${s//\"/\\\"}
    s=${s//$'\t'/\\t}
    s=${s//$'\r'/\\r}
    s=${s//$'\n'/\\n}
    printf '%s' "$s"
}

# run <block|allow> <command> <description>
# Reads $HOOK — the suite sets it from its first argument.
run() {
    local expect="$1" cmd="$2" desc="$3"
    local json out rc got
    json="{\"tool_input\":{\"command\":\"$(json_escape "$cmd")\"}}"
    out=$(printf '%s' "$json" | bash "$HOOK" 2>&1); rc=$?
    if [ "$rc" -eq 2 ]; then got=block; else got=allow; fi
    if [ "$got" = "$expect" ]; then
        PASS=$((PASS+1)); printf '  PASS  [%-5s] %s\n' "$got" "$desc"
    else
        FAIL=$((FAIL+1)); printf '  FAIL  [got %-5s want %-5s] %s\n' "$got" "$expect" "$desc"
    fi
}

result() {
    echo
    echo "=== RESULT: $PASS passed, $FAIL failed ==="
    [ "$FAIL" -eq 0 ]
}