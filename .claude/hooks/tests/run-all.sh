#!/bin/bash
# Runs every hook test suite in this directory.
# Usage:  bash .claude/hooks/tests/run-all.sh
#
# Why this exists: a hook was once found reverted to its pre-fix version in the
# working tree — a third of its assertions failing — and the test file that
# proved it had been deleted in the same move. Nothing ran the tests, so the
# regression stayed invisible for weeks. A test nobody runs is documentation,
# not a guard.
#
# Convention: a suite is `test-<hook>.sh` and takes the hook path as $1.
# Adding `test-foo.sh` next to `foo.sh` (or next to `lib/foo.sh`) is all it
# takes to be picked up.
#
# Expect roughly two and a half minutes: every case spawns a shell and each
# hook run spawns its own interpreter plus several sed/grep/awk, and on Windows
# those spawns dominate. That is the price of testing the hooks end-to-end
# rather than testing their regexes in isolation, and it is why this belongs at
# session close (/close step 8) rather than in a tight edit loop.

set -u
cd "$(dirname "$0")/.." || exit 1   # -> .claude/hooks

TOTAL_FAIL=0
RAN=0

for suite in tests/test-*.sh; do
    [ -f "$suite" ] || continue
    hook="$(basename "$suite" .sh)"
    hook="${hook#test-}.sh"

    [ -f "$hook" ] || hook="lib/$hook"

    if [ ! -f "$hook" ]; then
        echo "SKIP  $suite — no matching hook"
        continue
    fi

    echo "################ $hook ################"
    if bash "$suite" "$hook"; then
        echo "  -> OK"
    else
        echo "  -> FAILED"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
    RAN=$((RAN + 1))
    echo
done

if [ "$RAN" -eq 0 ]; then
    echo "No test suites found in .claude/hooks/tests/."
    exit 1
fi

if [ "$TOTAL_FAIL" -eq 0 ]; then
    echo "ALL $RAN HOOK SUITES PASSED"
    exit 0
fi

echo "$TOTAL_FAIL of $RAN HOOK SUITES FAILED"
exit 1