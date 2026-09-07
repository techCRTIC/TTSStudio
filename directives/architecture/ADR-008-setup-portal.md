# ADR-008 — The setup portal: how far the app reaches into its own environment

**Status:** accepted
**Date:** 2026-09-07
**Amends:** ~~ADR-007 (D2)~~ — **withdrawn the same day**; see the amendment box in D4. ADR-007 D2 stands unamended in every domain.
**Reaffirms:** ADR-001 (every engine call is server-side), ADR-004 (one module computes legal paths)
**Relates to:** ADR-003 (transcription outside ComfyUI → `faster-whisper large-v3` is a dependency the map must know), ADR-006 (ollama + `qwen3:4b`)
**Amends:** `directives/roadmap.md` — "environment preparation on the machine that already has the repository" is now **in** scope; public installers, third-party deployment and distribution stay **out** (D0)
**Backlog:** closes B-003, B-006, B-012; advances B-017
**Supersedes:** nothing

> ## ⚠️ Simplification pass — 2026-09-07, after acceptance
>
> The user's instruction was **"lo más simple posible"**, and three decisions
> were cut back the same day they were written. Recorded here rather than
> rewritten away, because an ADR that hides its own reversals is worth less than
> one that shows them.
>
> | Decision | As accepted | As amended |
> |---|---|---|
> | **D3** | Seam checker `check_dependency_map.py` written in the same session | **Deferred.** Written when the map and the code first drift, not before. |
> | **D4** | Server-owned job, survives a closed tab | **Cut.** Download lives with the page; abandoning it is safe because of D5. |
> | **D5** | Four states: installed / missing / **incomplete** / unverifiable | **Three states** (installed / missing / unverifiable) plus the atomic landing. `incomplete` is dropped — the atomic landing is what actually prevents a truncated file from reading as installed, so the state was paying for itself twice. `unverifiable` is **kept**: with the engine off, node presence genuinely cannot be checked, and collapsing that into `missing` would tell the user to reinstall something they already have. *(First trimmed to two states on 2026-09-07 and corrected the same day, during implementation, for exactly that reason.)* |
>
> **What was explicitly NOT cut:** D6 — a dependency is marked resolved only when
> a re-audit observes it, never by the installer's exit code. That is the line
> between a screen that helps and a screen that lies.

## Context

TTS Studio today **assumes** an entire stack and only *complains* when it is
missing. The complaint is already honest, already partial, and scattered across
places that do not know about each other: a bar warns, the nine preset speakers
disappear, and the rewrite button quietly degrades. Half the brain of a fix
already exists and is committed — a four-layer, capability-oriented audit that
emits machine-readable output and was written in anticipation of an installer.
What does not exist is the other half of the **map**, the **audit→install**
bridge, and — until this ADR — two decisions that are about project size rather
than implementation.

**Verified in the code before writing this, not recalled.** Three facts carried
in the planning skeleton were wrong or imprecise and are corrected here; the
code wins over the plan, always.

| Fact | Where |
|---|---|
| `hasEngineModel()` answers "has this been downloaded", not "is it intact", and its own docstring says so: *"A half-downloaded model would pass here and fail later, and that gap is stated rather than papered over."* | `web/src/lib/comfy-files.ts:255-257`, function at `:259-265` |
| The checkpoint the nine preset speakers live in is already a named constant — and is the one missing today. | `web/src/lib/comfy-files.ts:268` (`CUSTOM_VOICE_MODEL_DIR`) |
| The Python auditor declares the **same** blind spot from the other side: *"Verifica que un modelo EXISTA, no que sea el correcto ni que este integro. Un archivo truncado o renombrado pasa la auditoria."* | `.claude/skills/comfy-local/scripts/auditar_host.py:29-30` (skeleton said `:30`; it is a two-line statement) |
| The auditor already emits machine-readable output, and already returns `modelos_faltantes` structured for an installer. | `auditar_host.py:582` (`--json`), `:427` (built), `:491` (emitted) |
| The auditor already discovers ComfyUI's own interpreter — the one the requirements gotcha needs. | `auditar_host.py:353` (declared `None`), `:381` (populated) |
| `manifiesto.json` declares 8 models, 1 pack and 7 capabilities — and knows **nothing** about ollama, `qwen3:4b`, `Qwen3-TTS-12Hz-1.7B-CustomVoice` or `faster-whisper large-v3`. | `manifiesto.json:20-29` (models), `:11-18` (pack), `:31-` (capabilities, ids at `:33, :54, :72, :92, :109, :132, :149`) |
| The pack's requirements gotcha is already written down and still manual. | `manifiesto.json:15` (`requirements_manual: true`) and `:16` (the note naming the venv). **Correction:** the skeleton cited `:16` for the flag; the flag is `:15`. |
| **Correction — the 60 s timeout is not the blocker.** `runScript`'s `timeoutMs = 60_000` is a **default** and every caller may override it (`:77-78`), and `runScriptJson` forwards it (`:167-171`). The real disqualifier for a 4 GB download is that `runScript` accumulates stdout and stderr into strings (`:131-132, :155-156`) and resolves **only** on `close` (`:162`). There is no incremental callback anywhere in it: this path cannot report progress at all, at any timeout. | `web/src/lib/python.ts:74-185` |
| The launcher's watchdog beats every 15 s, spends one of **three** revivals per outage, and the comment states the budget is spent whether or not the relaunch succeeds. A ten-minute healthy stretch resets it. | `scripts/start.mjs:201` (`HEARTBEAT_MS`), `:217` (`MAX_REVIVALS`), `:227` (`STABLE_RESET_MS`), `:238` (`watchComfy`), `:264` (give-up gate), `:275` (increment before the attempt), `:283-284` (spent either way) |
| **There is no way to tell the watchdog a restart is expected.** `reviving` (`:242, :246, :274`) is a closure-local flag with no external setter, and a beat landing in the down window calls `ensureComfy()` (`:280`) — so a portal restart risks a *parallel relaunch*, not merely a wasted revival. | `scripts/start.mjs:238-295` |
| **Correction — the roadmap line is already amended.** `roadmap.md:27` no longer reads "Despliegue a terceros, instaladores públicos, distribución". The user amended it on 2026-09-07: environment preparation is in scope at `:24-26`, distribution stays out at `:30-31`, with the in-place amendment note at `:32-37`. This ADR records the reasoning; it does not request the edit. | `directives/roadmap.md:24-26, :28-37` |
| The rewrite path already distinguishes "ollama down" from "model not installed", and the model name is env-overridable. | `web/src/lib/llm.ts:68` (`MODEL`), `:296, :301, :303` (`checkLlm`'s three verdicts) |

**The shape of the problem:** the app has zero streaming routes, zero
background jobs and zero resumable downloads; its longest operation blocks for
610 s. "Real progress" over 4 GB therefore means inventing this project's first
long-running job with its own lifecycle. That is architecture, not a screen,
which is why the primary domain is backend though the visible deliverable is a
tab.

---

## Decision

### D0 — Onboarding on the user's own machine is not distribution

**Decided: option B.**

`roadmap.md` fused two different things into one out-of-scope line. Preparing
the environment on a machine that **already cloned the repository** is not
shipping a product to someone who does not have it, and leaving them fused was
blocking the portal by accident rather than by decision.

| Option | Consequence | Verdict |
|---|---|---|
| A — Reaffirm the line as written | The portal shrinks to *diagnose and guide*: no downloading, no installing. Cheapest, and the feature's stated purpose is not met. | Rejected |
| **B — Split the line: environment preparation on the machine that already has the repo is IN; public installers, third-party deployment and distribution stay OUT** | The portal may download and install. The packaged `.exe` question (B-017) stays outside. | **Accepted** |
| C — Drop the line entirely | Opens a distribution project. That is a different product. | Rejected |

Following the ADR-007 precedent — *correct the roadmap line in place, do not let
it erode by drift* — the amendment is written into `roadmap.md` in the same
session, marked in place, pointing back here.

### D1 — Portal v1: audit, guide, and install what is safely automatable

**Decided: option C.** This is the B-017 question, answered for v1 only.

| Option | What the portal does | Cost / risk | Verdict |
|---|---|---|---|
| A — Owner | Installs comfy-cli, installs ComfyUI, manages its venv, upgrades it | The app becomes a package manager for a foreign project it does not version. Weeks, unbounded, Windows-hostile. | Rejected for v1 |
| B — Checker | Detects, explains, shows the exact command, verifies afterwards | Two days — and the user still fights the pip/venv gotcha by hand, which is the single worst step. | Rejected |
| **C — Portal v1** | **Automates:** model and checkpoint downloads; `pip install -r requirements.txt` **with ComfyUI's own interpreter** + engine restart + re-audit; `ollama pull`. **Guides without installing:** comfy-cli and ComfyUI itself. | Bounded. Closes the gotcha nobody automates. Leaves the ownership question separately signable. | **Accepted** |

**"The portal owns ComfyUI" is explicitly deferred to a future ADR.** B-017 must
record that deferral as a deferral. The failure mode this guards against is
absorption by drift: a v1.1 that quietly starts installing ComfyUI because it
already installs everything around it, with no one having decided that the app
is now a package manager for a project it does not version.

The line between the two halves is not arbitrary. Everything the portal
automates is **reversible and self-contained**: a file it downloaded, a pip
install into an environment whose interpreter it merely *found*, a model pull.
Everything it only guides is **foundational and foreign**: installing the host
the app runs against.

### D2 — One auditor, and it lives in `execution/`

The auditor currently lives in `.claude/skills/comfy-local/`, which by contract
is the **portable harness**. Migrating the harness to another project must not
carry this project's runtime with it, and the eventual `.exe` (B-017) must not
lose its own auditor to a folder that was never part of the product.

| Option | Verdict |
|---|---|
| Runtime imports from `.claude/**` | **Forbidden.** Couples the product to the harness; the harness is designed to leave. |
| Copy into `execution/` and let both live | **Rejected.** Two auditors that diverge silently — the exact failure class this studio has already recorded once. |
| **Auditor moves to `execution/auditar_host.py`; the skill keeps a pointer, not a fork; consumed via `runScriptJson` (`web/src/lib/python.ts:167`)** | **Accepted.** |

The audit stays **pure stdlib**, which it already is — that property is
load-bearing for D8, not an aesthetic preference. Its exit codes (`:22-25`) are
diagnostics for a human at a terminal; the app reads `--json` and never branches
on the code (see D6).

### D3 — The manifest is the one dependency map, and a seam checker pays for it

`manifiesto.json` is extended with `Qwen3-TTS-12Hz-1.7B-CustomVoice` (~4 GB,
folder `Qwen3-TTS`, `es_directorio`), `faster-whisper large-v3` (2.9 GB, the
ADR-003 dependency), and a new **`servicios`** section for dependencies that
live outside ComfyUI entirely (`ollama` + `qwen3:4b`, 2.5 GB). Every entry
carries a human-readable purpose, its size in MB, its destination and its
origin.

This duplicates the map across two languages: the manifest on one side, and on
the other `CUSTOM_VOICE_MODEL_DIR` (`comfy-files.ts:268`), `MODEL`
(`llm.ts:68`) and the node classes the workflows require. Following ADR-007 D1
exactly, **the duplication is paid for in the same session** by
`execution/check_dependency_map.py`: stdlib, read-only, exits 1 when the two
sides disagree, blind spots declared in its docstring, and run by `/close`
alongside the four checkers that already exist (`check_engine_options.py`,
`check_trim_contract.py`, `check_voice_sidecar.py`,
`check_segment_contract.py`).

One blind spot is known in advance and must be in that docstring: `MODEL` is
`process.env.OLLAMA_MODEL ?? "qwen3:4b"` (`llm.ts:68`), so the checker can only
compare the **literal default**. An operator who overrides the env var is
outside its coverage.

Without this checker the portal will eventually announce "todo listo" while
`/api/voices` silently hides nine voices — a screen that asserts a falsehood is
worse than no screen.

### D4 — Progress transport, and the job that outlives the request

> ⚠️ **AMENDED 2026-09-07, same day, by the user: "lo más simple posible."**
> **The job no longer outlives the request, and ADR-007 D2 is therefore NOT
> amended after all.** A download lives as long as the page that started it; if
> the tab closes, the download is abandoned. This is defensible only because
> D5's atomic landing already guarantees an abandoned download leaves a temp
> file that is never mistaken for an installed one — the user re-enters and
> presses install again. The cost is a re-download; the saving is the entire
> job-store, its lifecycle and its recovery paths, which was the single largest
> source of complexity in this ADR.
>
> **What survives from this section:** progress is still reported by polling a
> simple in-memory record keyed by dependency, not by SSE or websocket. What is
> struck: persistence across requests, resumption, and the claim below that
> installs are "required to survive a closed tab" — the user has decided they
> are not.
>
> **Consequence for ADR-007:** its D2 rejection of a server-side job store now
> stands unamended in every domain. The header's `Amends:` line is kept for the
> record with this correction noted, rather than rewritten as if the detour
> never happened.

**Original reasoning, superseded above and kept for the record:**


**This is the amendment to ADR-007 D2**, which rejected a server-side job store
— correctly, for *generation*, because it would have rewritten the short path
that must not change. Installs are a different domain: minutes long,
byte-countable, and required to survive a closed tab. The rejection is amended
**for the install domain only**; the generation path is untouched and its
N=1 property still holds.

| Option | Verdict |
|---|---|
| SSE stream from the install route | New transport, no resumption story, and it dies with the request — the one thing that must not happen. |
| WebSocket | Unnecessary and against precedent: ADR-007 recorded that this project has no websocket and the client polls. |
| **Server-owned job + client polls `GET /api/setup/jobs/:id`** | **Accepted.** Polling is the established pattern here; a job whose state lives on disk survives both the tab and the poll. |

Non-negotiable: **a cancelled HTTP request must never kill a 4 GB download.**
The job's lifecycle belongs to the server process, not to the fetch that started
it. Progress is **measured bytes and measured speed — never an ETA**: the
manifest's own header says its timings are "ordenes de magnitud, no promesas"
(`manifiesto.json:8`), and the only comparable hard number this project owns is
610 s for 2.9 GB, measured on one machine.

Note the corrected reason this cannot go through `runScript`: not the 60 s
default (which is overridable), but the absence of any incremental callback —
it buffers and resolves on close (`python.ts:131-132, :155-156, :162`).
Downloads do not travel that path at all.

### D5 — Existence is not integrity: four states, and atomic landing

Both sides of the codebase already declare this blind spot
(`comfy-files.ts:255-257`, `auditar_host.py:29-30`). A portal that downloads and
then *certifies* what it downloaded is worse than no portal, because now there
is a screen making the claim.

- Download to a temporary name; **atomic rename only on completion**.
- Size checked against the manifest; hash where the origin publishes one.
- Per-dependency state is exactly one of **`instalada` / `falta` /
  `incompleta` / `no verificable`**, and `no verificable` **never** collapses
  into either of the other two. "I could not check" is an answer; pretending it
  is "missing" produces a pointless 4 GB re-download, and pretending it is
  "installed" produces the failure this whole ADR exists to prevent.

A download killed at 40 % must report `incompleta` on the next audit and offer
resume-or-clean. That is a test, not an aspiration.

### D6 — Verify by re-audit, never by exit code

A dependency is marked resolved only after a re-audit **observes** it — for
example `Qwen3VoiceClone` answering on `/object_info`. An installer that exits 0
without installing anything leaves the dependency displayed as missing.

This is mindset rule 1 (evidence before belief) compiled into the product, and
it is also why D2 keeps the app off the auditor's exit codes: `pip` returning 0
is a statement about `pip`, not about the engine.

### D7 — The requirements gotcha, automated against the right interpreter

`pip install -r requirements.txt` for `ComfyUI-Qwen3-TTS` runs with **ComfyUI's
`python_venv`** — the interpreter `auditar_host.py:381` already discovers —
never the global Python and never the project's own `.venv`. Then restart the
engine (D9), then re-audit (D6).

The gotcha has been written down since `manifiesto.json:15-16` and has been
manual ever since. Automating it is the single highest-value step in the portal:
it is the one the user cannot reasonably be expected to get right by hand,
because the correct interpreter is not the one their shell offers them.

If `python_venv` is `null` (its declared default at `:353`), the step is
**refused and explained**, not attempted against a guess. Installing a foreign
project's dependencies into the wrong environment is not a recoverable mistake.

### D8 — Bootstrap: the screen that fixes missing dependencies must not need one

On a fresh machine the project `.venv` may not exist, and `python.ts` is the
only path to Python this app has.

| Option | Verdict |
|---|---|
| Audit through the project `.venv` | **Rejected.** It fails precisely when it is needed most: the first run on a new machine. |
| **Stdlib-only audit run by whatever interpreter is available, plus a Node-side fallback that reports `no verificable` when no Python exists at all** | **Accepted.** |

This is why D2's "pure stdlib" is a constraint and not a compliment: the audit
must be runnable by *any* Python, including one the project did not create. The
venv rule of CLAUDE.md is untouched — nothing here installs into a global
Python; it only *reads* with one.

When no Python exists at all, the portal still opens and still says something
true: it reports `no verificable` and names Python itself as the first thing to
install, guided (D1 option C's "guide" half).

### D9 — A portal-initiated restart is maintenance, not a crash

`watchComfy()` spends one of three revivals per outage regardless of outcome
(`start.mjs:275, :283-284`), and — the sharper problem — a heartbeat landing in
the down window calls `ensureComfy()` (`:280`) while the portal is mid-restart.
The risk is not just an unfairly consumed budget; it is **two relaunches racing
for the same port**.

A restart the portal causes must therefore be **announced to the supervisor**,
which must then: burn no revival, trigger no parallel relaunch, and resume
normal watching once the engine answers again. The mitigation that
`STABLE_RESET_MS` (`:227`) already provides — ten healthy minutes clear the
budget — is real but too slow to cover an install sequence that restarts the
engine and immediately re-audits.

The supervisor keeps its cap and keeps its reasoning: three is still the number,
and a genuine crash loop is still stopped. Only *expected* downtime is exempted.

### D10 — Closed installation surface (security gate)

Every command and every URL the portal executes comes from the **versioned
manifest**. Never from user input. Never from text returned by a service — a
model index, a release feed and an error body are all **data**, not
instructions.

- No undeclared origin is ever contacted.
- Disk free space is compared against the manifest's MB total **before** the
  first byte is fetched; the auditor already reports free disk.
- `security-reviewer` must return PASS before `git-lead` may commit: this
  feature has network egress and process spawn, both of which are mandatory
  review triggers under the data-protection section of CLAUDE.md.

### D11 — v1 informs; it does not manage activation

Two of B-017's distinctions are correct and deliberately **out of this cut**:
"disk and VRAM are different budgets", and "installed ≠ chosen".

v1 therefore draws **no per-dependency toggle**. A switch would prefigure
activation without implementing it, and uninstalling the model the app is
currently using would break it silently — the interface would have made a
promise the system does not keep, which is what the product principles forbid.
The portal reports state and offers to *acquire* what is missing. It does not
offer to *deactivate* what is present.

---

## Consequences

- The project acquires its **first long-running background job** and its first
  durable-state route family. That is new architecture; it is why the primary
  domain is backend though the deliverable is a screen.
- ADR-007 D2 no longer reads as a blanket ban on server-side jobs. It is scoped
  to generation, and anyone reading it must be sent here.
- The auditor becomes runtime code under `execution/`; the harness keeps a
  pointer rather than a fork, and `check_dependency_map.py` fails the moment the
  map and the code disagree.
- `runScript` gains no streaming and needs none: installs do not travel that
  path. The 60 s default stays exactly as it is.
- `watchComfy()` gains one new input — "this outage was expected" — and keeps
  its three-revival cap and its reasoning intact.
- Degradation stays proportional. A missing *optional* dependency (ollama) must
  not block generation: `/api/text/improve` keeps returning its deterministic
  half, and the portal marks rewriting unavailable instead of standing in the
  way.
- Windows carries the real residual risk: pip inside a foreign venv, paths with
  spaces, and antivirus interfering with the rename of a 4 GB temporary file at
  the exact instant it completes.

## Still open (recorded, not decided here)

- Whether the portal ever *owns* ComfyUI (D1 option A). Its own future ADR;
  B-017 records the deferral rather than absorbing it.
- Activation — "installed ≠ chosen" — and disk-vs-VRAM as separate budgets
  (D11).
- What ships inside the `.exe` (B-017's second half). Still out of scope by D0.
- No measurement exists for the `-CustomVoice` download. The only comparable
  hard number is 610 s for 2.9 GB, on one machine. **No ETA is displayed
  anywhere until it is measured** — this project has already published an
  assumed 12 Hz that measurement turned into 12.56.
