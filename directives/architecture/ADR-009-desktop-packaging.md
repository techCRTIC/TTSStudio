# ADR-009 — Desktop packaging: Electron, and an `.exe` that carries only the app

**Status:** accepted
**Date:** 2026-09-07
**Amends:** ADR-002 — its *decision* (Next.js + TypeScript + Tailwind) is reaffirmed and this ADR depends on it; its *forward-looking clauses* naming Tauri as the destination (`ADR-002:44-47`, `:68-69`) are **superseded** by D1.
**Reaffirms:** ADR-001 (every engine call is server-side, `Origin` never crosses) — it is the reason a server must be inside the package at all (D0).
**Builds on:** ADR-008 (the setup portal is the first-run installer this `.exe` relies on; D2 and D6 are direct consequences of its D1 and D8).
**Amends:** `directives/roadmap.md:30-31` — "instaladores públicos, despliegue a terceros y distribución" stays out **except** the packaged `.exe` of the app itself, which is now **in** (D0). The `.exe` is named in that line today; that naming is what changes.
**Backlog:** answers **B-005**; advances **B-017**'s second half ("qué se lleva el `.exe`") and leaves its model-catalogue half open.
**Supersedes:** nothing.

> ## ⚠️ Reversal on the record — Tauri → Electron, 2026-09-07
>
> This project chose Tauri twice before choosing Electron: once in ADR-002
> (`:44-47`, "Tauri is the right destination and the wrong start"), and once
> again in the planning for this ADR, on the strength of an estimated **10-20 MB**
> binary. **That estimate was mine and it was wrong.** It is the size of a Tauri
> app whose frontend is static. This app's frontend cannot be static — D0 shows
> why with the code — so a Tauri build has to carry a Node server anyway, and the
> size advantage that justified the choice mostly evaporates.
>
> Recorded here rather than quietly rewritten, following ADR-008's precedent: an
> ADR that hides its own reversals is worth less than one that shows them. The
> lesson generalises past this decision — **a number that decides an architecture
> must be measured or marked as a guess.** This one was neither.
>
> | | As previously reasoned | As decided here |
> |---|---|---|
> | Packager | Tauri | **Electron** |
> | Basis | ~10-20 MB binary | That figure applied to a static frontend this app cannot have |
> | Cost ignored | — | Rust + cargo + MSVC toolchain absent on this machine; Node sidecar wiring on Windows |

## Context

**The goal, stated by the user:** a Windows `.exe` that a *base user* — someone
with a machine and no repository — can install, published as a **GitHub release**.
Today the only way to run TTS Studio is `npm start` on a clone (`package.json:8`),
which runs `scripts/start.mjs`.

### Verified before writing this, not recalled

Every claim below was read out of the code in this session. Where a fact carried
in the task brief was imprecise, the code wins and the correction is stated.

| Fact | Where |
|---|---|
| The app has **16 server routes**, and **not one of them can become static**. They fall into exactly three families, all of which need a server process. | 16 files matching `web/src/app/api/**/route.ts` |
| **Family 1 — the ComfyUI bridge (4 routes).** `comfy/[...path]`, `generate`, `status/[promptId]`, `voices`. All reach the engine through `comfyFetch`, whose entire purpose is to delete `origin`/`referer` before the request leaves. This is ADR-001 compiled into a module: ComfyUI answers 403 to a foreign `Origin`. A browser cannot do this to its own request. | `web/src/lib/comfy.ts:19-26` (the stripped set), `:47-53` (`comfyFetch`); reached via `lib/tts.ts:10`, `lib/voices.ts:17`, and `api/comfy/[...path]/route.ts:4-7` |
| **Family 2 — process spawn (8 routes).** `setup/audit`, `setup/install`, `segments/{split,join,verify}`, `text/{review,improve}`, `voices/transcribe`. Each launches Python. | `api/setup/install/route.ts:51` (`spawn`), `api/setup/audit/route.ts:23`, `lib/python.ts:74-185`, `lib/text-quality.ts:33`, `lib/transcribe.ts:51-52` |
| **Family 3 — filesystem inside ComfyUI's workspace (4 routes).** `takes`, `voices/{reference,preview,provenance}`. They read and write under `~/comfy`. | `web/src/lib/comfy-files.ts:43-48` (`COMFY_ROOT`, `OUTPUT_DIR`, `PROMPTS_DIR`, `INPUT_DIR`) |
| **The brief's claim holds, and now by enumeration rather than by sample:** 4 + 8 + 4 = 16. The package must contain a Node server **with any packager whatsoever.** | — |
| `web/next.config.ts` is an **empty config object**. There is no `output: "standalone"`, which is what a packaged build needs to be bounded in size. | `web/next.config.ts:3-5` |
| **Rust and cargo are not installed on this machine** (`cargo --version` → command not found), verified by the user this session. Tauri additionally requires the MSVC build tools on Windows. | user-verified 2026-09-07; **not re-measured here** |
| The launcher already solves cold start, occupied port, engine supervision and clean shutdown — and is **pure Node stdlib on purpose**, so `npm start` works on a clean checkout with no root install. | `scripts/start.mjs:11-12` (the no-dependency contract), `:79-111` (`ensureComfy`), `:138-164` (`clearPort`), `:238-295` (`watchComfy`), `:318-324` (spawn), `:332-339` (shutdown) |
| The port is fixed at **3000** with `PORT` as the only escape. | `scripts/start.mjs:24` |
| **`clearPort()` identifies "ours" by fetching the page and matching `<title>TTS Studio</title>`.** Anything else on the port is reported and never killed. | `scripts/start.mjs:146`, `:150-155` |
| **History and favourites live in `localStorage`.** | `web/src/lib/history.ts:89, :117`; `web/src/lib/favorites.ts:46, :70` |
| **`projectRoot()` walks up at most four directories looking for `pyproject.toml` and throws if it does not find it.** | `web/src/lib/python.ts:24-34` |
| **`pythonPath()` requires `<root>/.venv/Scripts/python.exe` and throws "Ejecuta `uv sync` en la raíz" otherwise.** Every Python consumer goes through both. | `web/src/lib/python.ts:44-57`, `:53`; callers at `api/setup/install/route.ts:50-53`, `api/setup/audit/route.ts:23`, `lib/transcribe.ts:51-52` |
| The audit route **already degrades honestly** when Python is absent — it returns `disponible: false` with an empty report. **The install route has no such fallback.** | `api/setup/audit/route.ts:35-49` vs `api/setup/install/route.ts:50-53` |
| **Measured Python dependency surface: exactly two runtime scripts need third-party packages.** `tts_unir_tramos.py` imports numpy and soundfile at module level; `transcribe_audio.py` imports `faster_whisper` **lazily, inside the run**. Everything else in `execution/` is pure stdlib. | `execution/tts_unir_tramos.py:58-59`; `execution/transcribe_audio.py:100, :119`; stdlib-only: `auditar_host.py:41-50`, `instalar_dependencia.py:41-49`, `tts_trocear_guion.py:76-79`, `tts_revisar_texto.py:36-40`, `tts_normalizar_texto.py:30-34` |
| Declared Python dependencies: `faster-whisper`, `soundfile`, `numpy`. | `pyproject.toml:6-14` |
| The app **invokes** ComfyUI and comfy-cli as separate processes; it links to neither. | `web/src/lib/comfy.ts:47-53` (HTTP), `scripts/start.mjs:94` (`comfy launch --background`) |
| **`execution/manifiesto.json` carries no licence field.** A grep for `licencia\|license` returns nothing — and B-017 explicitly asked for licence per catalogue entry. | `execution/manifiesto.json`; `directives/backlog.md:254` |
| **The repository has no `.github/` directory.** *(Corrected 2026-09-07, same day: this line also claimed there was no root `LICENSE`. There is — MIT, committed in `391aae8` earlier the same session. Verified, not recalled.)* There is no CI, and a public release today would be "all rights reserved" by default. | verified by glob |
| Next 16.3.1 / React 19.2.8; root app version `0.1.0`. | `web/package.json:13`, `package.json:3` |

**The shape of the problem.** Packaging this app is not "wrap a frontend". It is
shipping a supervisor, a Node server, a process-spawn bridge to Python, and a
first-run installer, in one artefact, to a machine that has none of the things
the app depends on. The interesting decisions are all about **what is inside the
file** and **what happens on first launch**, not about which packager draws the
window.

---

## Decision

### D0 — The packaged `.exe` enters scope; distribution of anything else does not

`roadmap.md:30-31` currently puts the packaged `.exe` explicitly **out** of
scope, with `B-017` cited. That line was amended once already, on 2026-09-07, by
ADR-008 D0 — which split "preparing the environment on a machine that already
has the repo" from "distribution" and kept the `.exe` outside. This ADR changes
the remaining half, deliberately and with the user's decision behind it.

**In scope from now on:**
- A packaged **Windows** `.exe` of **the app itself**, published as a **GitHub
  release**, installable by someone who does not have the repository.
- Its first run is the ADR-008 portal, which audits the machine and installs what
  it is allowed to install.

**Still out of scope, and this list is the point of the amendment:**
- macOS and Linux builds.
- Auto-update.
- Code signing (D8 decides this explicitly rather than by omission).
- **Redistributing anything that is not this app** inside the artefact: ComfyUI,
  comfy-cli, models, or a Python runtime (D2, and the licence line in D7).
- Multi-user, authentication, hosted or remote deployment. Packaging the app is
  not turning it into a service; it remains single-user and local.

The wording matters because the old line fused "publish an installer of our own
app" with "ship someone else's software to third parties". They are different
acts with different consequences, and only the first is being authorised.

### D1 — Electron, not Tauri

**Decided: option B.**

| Option | What it costs here | Verdict |
|---|---|---|
| A — **Tauri** | Requires Rust + cargo (**absent on this machine**, verified) and the MSVC build tools on Windows: a prerequisite install the user reports at **>1 GB**. And because the 16 routes cannot be static, it must *still* ship a Node server as a sidecar — the fragile part on Windows, where the sidecar's lifecycle, working directory and orphan cleanup are all hand-written. | **Rejected** |
| **B — Electron** | Ships Chromium + Node in one runtime. The Node the server needs is the Node the shell already has, so there is no sidecar-runtime problem to solve — only a child process to supervise, which `start.mjs` already knows how to do. No new language, no new toolchain, no new compiler. | **Accepted** |
| C — Browser tab, keep `npm start` | Zero packaging work, and does not answer the request at all: a base user has no Node and no repository. | Rejected |
| D — Wrap in a WebView2-only shell hand-rolled | Smaller, and re-implements Electron badly, with no ecosystem for installers, icons or file dialogs. | Rejected |

**On size, honestly.** An Electron build of this app is **estimated ~150 MB**; a
Tauri build carrying a Node server is **estimated ~90-150 MB**. **Neither number
is measured, and neither should be quoted as if it were.** They are here only to
support one qualitative claim, which does not depend on their precision: *once
Node has to be in the package either way, the size gap stops being the deciding
factor, and what remains of Tauri is its cost.* If someone later measures both
and finds a 3× gap rather than a ~1.2× one, this decision is worth revisiting —
that is what makes it a reversible decision rather than a doctrine.

**Adversarial check, recorded because it nearly changed the answer.** The
strongest case for Tauri is that its WebView2 requirement is usually already
satisfied on Windows 11, making the *download* far smaller. That is true and it
does not survive contact with the rest of the picture: it does not remove the
Node sidecar, it does not remove the Rust toolchain from the *author's* machine
(the release has to be built somewhere), and it makes the runtime depend on a
system component whose version the app does not control. Electron's bulk is the
price of the app carrying its own known-good runtime, which for an app that
spawns processes and supervises an engine is the property worth paying for.

### D2 — The `.exe` carries only the app

The installer contains: the Electron shell, the built Next server, and
`execution/` + `pyproject.toml` + `execution/manifiesto.json` as resources —
because those *are* the app (they are Layer 3 of this project, not third-party
software).

It does **not** contain ComfyUI, comfy-cli, the models, or a Python interpreter.
Those are acquired at first run by the ADR-008 portal, which already exists:
`SetupGate` opens by itself when something blocking is missing, and cannot be
dismissed in that mode (`web/src/components/SetupGate.tsx:17-22`).

This is not a new decision so much as the enforcement of one B-017 already made
for good reasons (`directives/backlog.md:247-251`): transcription is 2.9 GB, the
text model 2.5 GB, plus the voice model. **Nobody downloads a 20 GB installer**,
and each of those artefacts updates on its own schedule. The corollary that must
not be lost: **every one of those artefacts is a first-run download**, so the
first launch of this `.exe` is a long one, and the portal has to say so.

### D3 — One launcher, split — never two launchers

`scripts/start.mjs` already solves, on this platform, with this engine: cold
start and the 120 s wait (`:79-111`), the occupied port (`:138-164`), the
three-revival supervisor (`:238-295`), and killing the process **tree** on
Windows (`:333`). Electron needs every one of those.

| Option | Verdict |
|---|---|
| Electron main re-implements what it needs | **Rejected.** Two launchers drift apart; the day they disagree, `npm start` and the `.exe` behave differently and nobody knows which is right. This studio has already recorded that failure class once. |
| Electron shells out to `node scripts/start.mjs` | **Rejected.** It builds (`:178-184`), it opens a browser (`:186-190`), and it owns a lifecycle Electron must own. Wrong process boundary. |
| **Extract the reusable half into one stdlib-only module; `start.mjs` and Electron main both become thin callers** | **Accepted.** |

What moves into the shared module: `responds`, `waitFor`, `pidOnPort`,
`clearPort`, `ensureComfy`, `watchComfy`, `resolveComfyBin`, and the tree-kill.
What stays CLI-only: `buildApp()` (`:178-184` — a packaged app is already built;
building at runtime would be absurd) and `openBrowser()` (`:186-190` — Electron
has a window).

**The module stays pure Node stdlib.** That is a hard constraint, not a
preference: `start.mjs:11-12` promises `npm start` works on a clean checkout with
no root install, and this refactor must not be what silently breaks it.

**Tripwire.** No checker is written for this, because the duplication is
prevented by construction and a checker that polices copy-paste is a worse answer
than not copy-pasting. But if Electron's main process ever grows its own
`ensureComfy` or its own port logic, *that* is the moment
`execution/check_launcher_parity.py` gets written, in the same session — the
standing rule for seams in CLAUDE.md.

### D4 — The port is chosen once and then kept, because the user's history is bound to it

This is the decision most likely to be got wrong, so the reasoning is spelled
out.

**The finding that decides it:** history and favourites are stored in
`localStorage` (`history.ts:89, :117`; `favorites.ts:46, :70`). Chromium
partitions `localStorage` **by origin**, and `http://localhost:3000` and
`http://localhost:3117` are different origins. **An app that picks a free port on
each launch therefore erases the user's entire history and favourites every time
the port changes — silently, with no error, looking exactly like data loss,
because it is.**

| Option | Verdict |
|---|---|
| A — Keep 3000 fixed, fail if taken | **Rejected.** An installed app that refuses to open because another program holds 3000 is not shippable. |
| B — Pick any free port each launch | **Rejected — and this is the option that looks obviously correct.** It destroys history non-deterministically. |
| **C — Sticky port: choose once at first run (prefer 3000, then a deterministic scan), persist it in Electron's `userData`, reuse it forever** | **Accepted.** The origin is stable across launches, so the data is too. Preferring 3000 also means an existing user who has been running `npm start` keeps their history when they install the `.exe`. |
| D — Move history out of `localStorage` into a file under `userData` | Correct long-term and out of this cut: it is a data migration with its own failure modes. Recorded in *Still open*. Option C is what makes it non-urgent rather than unnecessary. |

If the stored port is occupied at launch, the app **does not silently move**. It
says what happened, says plainly that its saved history lives with the old port,
and lets the user choose. A relocation that quietly empties the history screen is
the "interface that makes a promise the system does not keep" this project's
principles forbid.

**One consequence for `clearPort()`.** Its identification test — fetch the page,
match `<title>TTS Studio</title>` (`start.mjs:146`) — was safe while exactly one
copy of this app existed on the machine. After distribution, a dev server from a
clone and the installed `.exe` are indistinguishable by that test, and the
packaged app would helpfully kill the user's other work. **The packaged app never
kills a process it did not start.** It detects, reports, and offers the choice.
The CLI keeps today's behaviour, where the premise still holds.

### D5 — The Next server is a child of Electron, and it dies with it by three independent mechanisms

**How it starts.** `web/next.config.ts` gains `output: "standalone"`
(`:3-5` is empty today), producing `.next/standalone/server.js` with a minimal
`node_modules` — that is what bounds the packaged size. Electron main spawns it
**as a child of itself** with `ELECTRON_RUN_AS_NODE=1`, so the packaged Node is
the Node the server runs on and there is no second runtime in the artefact.

Rejected: running the server **in** the Electron main process. A server fault
would then take the window with it, and the window is the only thing that can
tell the user what went wrong. Isolation is the whole point.

**How it stops — and why one mechanism is not enough.** Today's shutdown fires
only on `SIGINT`/`SIGTERM` (`start.mjs:337-338`). Electron adds exits that never
pass through those: `before-quit`, `will-quit`, the last window closing, and the
one everyone forgets — **the main process being killed from Task Manager or
crashing**, where no handler of ours runs at all. On Windows a non-detached child
is **not** reaped when its parent dies. So:

1. **On `before-quit`**, kill the tree with `taskkill /PID <pid> /F /T` — the
   call `start.mjs:333` already makes, reused, not rewritten (D3).
2. **A death-of-parent signal the child can observe by itself**: the server is
   spawned with an IPC channel and wrapped by a small launcher of ours that
   registers `process.on("disconnect", …)` before importing `server.js`. When the
   parent vanishes for *any* reason, the channel closes and the child exits.
   *Unverified until built:* Next's standalone `server.js` does not register such
   a handler on its own — the wrapper is what makes this real, and it must be
   tested by killing the parent from Task Manager, not by reasoning.
3. **The next launch's `clearPort()`** (D4), which is the last resort that has to
   exist anyway because mechanisms 1 and 2 can both be defeated by a hard power
   loss.

A shutdown handler that never runs is not a mechanism. That is why there are
three.

### D6 — The Python seam does not survive packaging, and this is the blocking gap

This is the finding that most threatens the promise of D2, and it was not in the
brief.

- `projectRoot()` walks up ≤4 directories for `pyproject.toml` and **throws**
  when it fails (`python.ts:24-34`).
- `pythonPath()` demands `<root>/.venv/Scripts/python.exe` and **throws**
  `"Ejecuta \`uv sync\` en la raíz"` (`python.ts:44-57`, message at `:53`).
- On a fresh install there is no `.venv`. The audit route degrades honestly
  (`api/setup/audit/route.ts:35-49`), so the portal opens and says it cannot
  audit. **But the install route calls `pythonPath(root)` unguarded
  (`api/setup/install/route.ts:50-53`)** — so on the exact machine the portal
  exists for, it can neither diagnose nor install. **ADR-008 D8's bootstrap is
  decided and not implemented.** Packaging is what turns that from a latent gap
  into the first thing a base user hits.

**Decided:**

1. **`projectRoot()` gets a packaged answer instead of a guess.** Electron main
   sets an explicit resources path; the cwd walk stays as the dev fallback.
   Inferring the root by walking up from an install directory is a guess that
   will be wrong on someone's machine.
2. **The stdlib half runs on any interpreter that exists.** `auditar_host.py` and
   `instalar_dependencia.py` are pure stdlib (`:41-50`, `:41-49`), so they must
   be runnable by a discovered `python` when `.venv` does not exist. This is
   ADR-008 D8 made real, and the install route needs the same honest failure the
   audit route already has.
3. **The venv is a dependency the portal installs, like a model.** The measured
   surface is small and worth stating precisely: **only two runtime scripts** need
   third-party packages — `tts_unir_tramos.py:58-59` (numpy, soundfile) and
   `transcribe_audio.py:100, :119` (faster-whisper, imported lazily inside the
   run). So only **joining long-script segments** and **transcription** are
   blocked without it. Until the venv exists those two capabilities report
   unavailable; nothing else is affected, and nothing crashes. `uv` is not assumed
   present — `python -m venv` + `pip` is the portable path.
4. **No embedded CPython in v1.** It roughly doubles the installer to buy a
   capability the portal already owns, and CLAUDE.md's venv rule is built on the
   environment being *regenerable from a declared dependency file*
   (`pyproject.toml:6-14`), which is exactly what the portal would do. Marked
   **reversible**: if first-run Python setup proves fragile on real machines,
   embedding an interpreter is the fallback — and it needs its own ADR, because
   it changes what is distributed (D7).

### D7 — The app aggregates GPL software; it does not distribute it. Here is the line

**Today's position, stated as a fact about bytes rather than as legal advice:**
TTS Studio invokes ComfyUI over HTTP (`lib/comfy.ts:47-53`) and comfy-cli as a
subprocess (`start.mjs:94`). It links against neither, contains neither, and
ships neither. ADR-008 D1 kept it that way on purpose — the portal *guides* the
installation of ComfyUI and comfy-cli, it does not perform it. **An `.exe` that
carries only the app (D2) preserves that position exactly.** Publishing it
distributes no GPL-3.0 code.

**The line, written down so nobody crosses it by accident.** The moment ComfyUI,
comfy-cli, or any other GPL-3.0 component is placed *inside the installer* or
inside the app's own installed tree, the release becomes a **distribution of that
software**, and with it:

- the obligation to offer the **complete corresponding source** for that
  component to every recipient (GPL-3.0 §6), for the exact version shipped;
- shipping its licence text and notices;
- and an analysis nobody has done yet, of whether the combination is a "work
  based on" the program — which would reach this app's own code and its own
  licensing.

**A PR may not cross that line. Crossing it requires its own ADR.** The realistic
way it gets crossed is not a decision but a convenience: a v1.1 that "just
bundles comfy-cli so the user does not have to install it". That is the exact
absorption-by-drift failure ADR-008 D1 already warned about, arriving through the
packaging door instead of the portal door.

**Two gaps this exposes, recorded because the release runs into both:**
- **`execution/manifiesto.json` has no licence field** (verified: no match for
  `licencia|license`). The portal downloads models and node packs on the user's
  behalf; the versioned manifest is the right place to record each artefact's
  licence and origin, and B-017 asked for exactly that (`backlog.md:254`). It
  belongs to the manifest's owner, not to this ADR.
- ~~The repository has no root `LICENSE`.~~ **Wrong — it has one** (MIT, `391aae8`). Kept struck through rather than deleted, because a release checklist that silently loses an item is how the item gets done twice or not at all. A public GitHub release without one
  is "all rights reserved" by default. That may well be what the user wants —
  but it should be chosen, not defaulted into, before the first release.
- The licences of `ComfyUI-Qwen3-TTS` and of the Qwen3-TTS weights are
  **unverified** and are not asserted here in either direction.

### D8 — Unsigned, and the user is told the truth about it

**Decided: ship unsigned in v1.**

Windows SmartScreen will show "Windows protegió tu PC" on an unsigned installer
until it accrues download reputation. An OV certificate costs money annually and
*still* needs reputation to build; an EV certificate grants immediate reputation
at a higher cost plus a hardware token. For a release whose audience is currently
one person and possibly a handful of others, that is not a defensible purchase
yet.

What is **not** acceptable is pretending it will not happen. So:

- The release notes and the README state plainly that the build is unsigned, and
  give the exact click-path (*Más información → Ejecutar de todas formas*).
- The **SHA-256 of the artefact is published** with the release. It is the honest
  substitute for a signature: it does not prove who built the file, but it lets
  anyone verify the file they downloaded is the file that was published.
- **Nobody is ever told to disable SmartScreen or add an antivirus exclusion.**
  Teaching a user to switch off their protections to run your software is a
  worse outcome than the warning.

**Recorded risk with a named fallback:** antivirus false positives on NSIS
installers from Electron builds are a known class, and this app spawns processes
and downloads gigabytes, which is behaviour heuristics dislike. If it happens, the
fallback is a **portable zip** published alongside the installer. That is a
contingency, not a plan.

Revisit signing when there is a real second user, or when the false-positive rate
makes it cheaper than the support burden.

### D9 — Released by hand on GitHub; no auto-update in v1

- Artefact: a Windows installer (plus a portable zip if D8's fallback triggers),
  built locally and uploaded to a **GitHub release**. There is **no `.github/`
  directory and no CI today** (verified); a release workflow is deferred because
  without the signing story (D8) it would automate the production of an artefact
  the user still has to click through a warning to install.
- Version comes from `package.json:3` (`0.1.0`) — one version number for the
  product, not a second one invented for the installer.
- **No auto-update.** It needs a signed build to be trustworthy on Windows, and
  it adds an outbound network path *into* the app, which under CLAUDE.md's egress
  rules is not something to acquire casually. Updating means downloading the next
  release, which for a single-user local tool is proportionate.

### D10 — What "base user" honestly means after this ADR

Tested adversarially against the actual first run, because the goal is stated as
"llegar a un usuario base" and a decision that quietly fails its own goal is
worse than one that admits the gap.

A base user — Windows, no repo, no Node, no Python, no ComfyUI — installs the
`.exe`, and the app opens. The portal audits and finds: no Python, no ComfyUI, no
comfy-cli, no models. Per ADR-008 D1 option C, the portal **installs** models,
node requirements and `ollama pull`, and only **guides** for ComfyUI and
comfy-cli themselves.

**So the base user's first run ends with them following written instructions to
install ComfyUI by hand.** That is the truth, and this ADR states it rather than
letting the release page imply otherwise:

> **This `.exe` reaches a user who is willing to follow a guided install of
> ComfyUI. It does not yet reach a user who expects one click.**

This does not change D1 or D2 — packaging is not what is missing. What is missing
is the deferred half of ADR-008 D1 ("does the portal ever *own* ComfyUI"), which
is precisely where the remaining distance lives. The release notes must set the
expectation the product actually meets.

---

## Consequences

- **ADR-002 no longer points at Tauri.** Anyone reading its `:44-47` or `:68-69`
  must be sent here. Its actual decision — the Next.js stack — is untouched and
  is what makes this packaging possible at all.
- `web/next.config.ts` stops being empty. `output: "standalone"` becomes
  load-bearing: without it the packaged size is unbounded.
- `scripts/start.mjs` becomes a thin CLI over a shared stdlib-only module. The
  supervisor's three-revival cap and all its reasoning (`:217`, `:227`) are
  reused verbatim, not re-decided.
- **The port becomes state.** The app acquires its first persisted preference in
  `userData`, and the reason is data safety, not convenience.
- **ADR-008 D8 stops being optional.** Packaging is what makes the bootstrap gap
  reachable; `api/setup/install/route.ts` needs the honest failure that
  `api/setup/audit/route.ts:35-49` already has.
- **The licence position is now written down** (D7) with the line named. It costs
  nothing while the `.exe` carries only the app, and it is the only thing standing
  between a convenient bundling PR and an obligation nobody noticed taking on.
- The first launch on a clean machine is **long** — multi-gigabyte downloads —
  and that is a product-facing fact the release notes and the portal must both
  state, not a detail.
- Windows carries the residual risk, as it does throughout this project:
  SmartScreen, antivirus heuristics on the installer, spaces in install paths,
  and orphaned child processes when the shell dies uncleanly (D5 mechanism 2 is
  the part most likely to need a real test rather than an argument).

## Still open (recorded, not decided here)

- **Moving history and favourites out of `localStorage`** into a file under
  `userData` (D4 option D). D4-C removes the urgency; it does not remove the
  fragility of user data living in an origin-scoped browser store.
- **Whether the portal ever owns ComfyUI** — deferred by ADR-008 D1, and now the
  single largest gap between this `.exe` and a one-click base user (D10).
- **Embedding a CPython runtime**, if first-run Python setup proves fragile on
  real machines (D6.4). Needs its own ADR because it changes what is distributed.
- **Code signing**, revisited when there is a second real user or when antivirus
  false positives cost more than a certificate (D8).
- ~~A root `LICENSE` for the project~~ (already done, MIT), and **licence + origin fields in
  `execution/manifiesto.json`** (D7). Both are prerequisites for a release that is
  honest about what it is and what it fetches; neither is this ADR's to write.
- **B-017's model-catalogue half** — which models are offered, with size, VRAM,
  origin and licence, and the "installed ≠ chosen" distinction. Untouched here.
- **No size measurement exists for any build of this app.** Every figure in D1 is
  an estimate. The first real build should measure it and the number should be
  written back into this file — the same discipline that turned an assumed 12 Hz
  into a measured 12.56.
