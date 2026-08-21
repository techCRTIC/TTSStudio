"""
Make this process speak UTF-8, whatever the platform thinks.

THE BUG THIS EXISTS FOR
    On Windows, `sys.stdout.encoding` is the console's code page — cp1252 on
    this machine — not UTF-8. So `json.dump(..., ensure_ascii=False)` writes
    "más" as the byte 0xE1, which is perfectly good cp1252 and NOT VALID UTF-8.

    Node reads that stream and decodes it as UTF-8, because that is what it
    decodes everything as. Each invalid byte becomes U+FFFD, and by the time the
    text reaches the browser every accent is a replacement character.

    In this project that was not cosmetic. The transcript of a reference clip is
    what the voice embedding is computed against, so a corrupted transcript
    produces a worse voice — quietly, with nothing failing anywhere.

WHY A SHARED MODULE
    Every script in execution/ prints Spanish, and every one of them had the
    same defect. Fixing them one at a time leaves the next script to rediscover
    it. Same reasoning as the seam checkers: fix the class, not the instance.

USAGE
    from _console import use_utf8
    use_utf8()          # first thing in main(), before anything is printed
"""

from __future__ import annotations

import sys


def use_utf8() -> None:
    """
    Force stdout and stderr to UTF-8.

    `reconfigure` exists on Python 3.7+ and is the supported way to change an
    already-open text stream. It is guarded anyway: a caller may have replaced
    the streams with something that has no such method (a test harness capturing
    output, for instance), and refusing to run because the console is unusual
    would be worse than printing through it unchanged.

    `errors="replace"` on stderr only: diagnostics must never be the reason a
    tool dies. stdout is left strict, because stdout is the machine-readable
    result and silently mangling it is exactly the failure being fixed here.
    """
    for stream, errors in ((sys.stdout, "strict"), (sys.stderr, "replace")):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors=errors)
        except (ValueError, OSError):
            # A stream that cannot be reconfigured still works; it just keeps
            # the platform's encoding. Better than refusing to run.
            pass
