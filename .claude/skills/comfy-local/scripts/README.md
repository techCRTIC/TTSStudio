# The auditor moved — it is not forked here

`auditar_host.py` and `manifiesto.json` now live in the project's
`execution/` directory:

- `execution/auditar_host.py`
- `execution/manifiesto.json`

**Why (ADR-008 D2):** the app's setup portal runs the auditor at runtime, and
the app must never depend on anything inside `.claude/**` — that directory is
the portable harness, not runtime code. Two copies would have drifted, and a
dependency map that disagrees with itself is worse than none.

Call them by path from the project root. Do not copy them back here.
