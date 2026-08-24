# ADR-005 — Voice provenance lives in a sidecar file next to the voice

**Status:** accepted
**Date:** 2026-08-24
**Supersedes:** nothing. **Amends:** ADR-004 (the security posture of `comfy-files.ts`).

## Context

Roadmap Phase 2 requires **visible provenance** for every voice, and the reason
is stated in the roadmap itself: *"las voces son de personas identificables"*.
A voice in this app is a clone of a real human being. Which human, when it was
recorded, and under what permission are not decorations — they are the record
that makes the feature defensible.

The app had nowhere to put that record. Until this ADR, the voice library was
deliberately **not** a database:

> The voice library is not a database this app keeps — it is whatever ComfyUI
> reports from `models/Qwen3-TTS/prompts/`.
> — `web/src/lib/voices.ts`

> Nothing is written to any registry — `Qwen3SavePrompt` drops a `.safetensors`
> into the engine's prompts directory, and GET reports it from there on the next
> read. One source of truth.
> — `web/src/app/api/voices/route.ts`

`listVoices()` reads the `Qwen3LoadPrompt` combo out of `object_info` and
derives a label by splitting the filename. That is the whole model. It cannot
drift, because there is nothing to drift from.

So provenance is not "surface a field we already hold". It is **introducing
persistent state where the design deliberately had none**, and the cost of that
has to be paid consciously.

### Correction, 2026-08-24: a registry already existed

The paragraph above was written before anyone looked in the prompts directory,
and it was wrong in a way worth recording rather than quietly editing out.

`models/Qwen3-TTS/prompts/voces.json` has been there since **2026-08-19**, the
project's first session, carrying almost exactly the fields this ADR designed:

```json
{"andres_bobe": {"archivo": "andres_bobe.safetensors", "registrada": "2026-08-19",
  "de": "entrevista '…', pasaje 5.02-15.66s", "duracion_referencia_s": 10.64,
  "notas": "…", "ref_text": "…"}}
```

**Nothing read it.** The app derived voices from `object_info` and never looked
at the file sitting beside them, so the project's oldest voice would have
displayed "sin procedencia registrada" while its provenance lay unread on the
same disk — a feature failing on the exact case it was built for.

What this changes, and what it does not:

- **The decision stands.** A single registry has the reconciliation problems
  §"Why next to the voice" lists, and `voces.json` demonstrates them: it is
  hand-maintained, keyed inconsistently (by slug, with the filename repeated
  inside), and nothing keeps it in step with the directory.
- **The legacy data is migrated, not discarded.** `execution/migrate_voice_provenance.py`
  seeds sidecars from it, filling only empty fields so a user's edit always
  wins. `ref_text` is deliberately NOT copied, per §"What is stored".
- **`voces.json` is left in place.** It holds the transcript this ADR chose not
  to carry, it is the user's file, and deleting it is their call.
- **The lesson generalises:** "there is nowhere to put this" is a claim about
  the filesystem, and it should have been checked against the filesystem.

Two further facts constrain the choice:

1. **The reference clip is gone by design.** ADR-004's retention rule deletes it
   as soon as the embedding exists, and the UI tells the user so. Provenance
   cannot lean on the original audio being around.
2. **The existing voice predates all of this.** `andres_bobe.safetensors` was
   computed outside the app. Any design that captures provenance *only at
   registration* leaves the project's only real voice permanently blank.

## Decision

**Provenance for a voice `X` lives in `X.json`, written next to
`X.safetensors` in ComfyUI's `models/Qwen3-TTS/prompts/` directory.**

### Why next to the voice, and not elsewhere

| Option | Why not |
|---|---|
| `localStorage`, like history and saved seeds | The browser profile is the account for *takes* and *seeds*, which are that user's working material. Provenance is a property of **the voice file**, and the voice file outlives the browser profile. Clearing site data or opening from another profile would leave the `.safetensors` on disk with no record of whose voice it is — losing precisely the thing this feature exists to keep. |
| One project-wide registry JSON | Easier to read and back up whole, but it does not travel with the voice and needs manual reconciliation every time a `.safetensors` appears or disappears outside the app. |
| Sidecar next to the voice **(chosen)** | Travels with the voice, dies with the voice, survives the browser and the app. The app already reaches this disk under ADR-004, so it is not a new capability — only a new operation. |

### The reconciliation rule: the engine still wins

This is what keeps "two sources of truth" from becoming a defect. The
`.safetensors` files reported by the engine remain **the** list of voices. The
sidecar is a decoration joined to that list by id, and it is never authoritative:

- **Voice with no sidecar** → shown as *"sin procedencia registrada"*, which is
  the truth, and editable so it can be filled in. This is the path that gives
  `andres_bobe` a provenance it never had.
- **Sidecar with no voice** → ignored on read. It is a few hundred bytes of
  nothing, and inventing a voice out of it would be exactly the drift this rule
  exists to prevent.
- **Deleting a voice** deletes its sidecar and its cached sample, best-effort,
  the same way registration deletes the reference clip: the voice is what the
  user asked to destroy, and a failure to remove a decoration must never read as
  a failed delete.

**Verified, not assumed:** the pack lists voices with
`for f in os.listdir(QWEN3_TTS_PROMPTS_DIR): if f.endswith(".safetensors")`
(`nodes.py:636-638`). A `.json` in that directory is therefore invisible to the
engine's combo and cannot appear as a phantom voice. `execution/check_voice_sidecar.py`
re-checks this against the installed pack, because if that filter ever widens,
every sidecar silently becomes a fake voice and no test in this project would
see it.

### What is stored — and what deliberately is not

Five fields, and the list is short on purpose (CLAUDE.md § 3, data minimization):

| Field | Why it is needed |
|---|---|
| `displayName` | The name **as typed**, with accents. The slug cannot round-trip: `andres_bobe` can never become "Andrés Bobe" again. |
| `registeredAt` | When this person's voice was turned into a clone. |
| `source` | `upload` / `microphone` / `pre-existing` — how the audio arrived. |
| `refSeconds` | How much audio the embedding was computed from; the honest measure of its quality. |
| `note` | Free text from the user. **This is where consent lives**: whose voice this is and with what permission. |

**Not stored: the transcript of the reference clip.** It is not needed to
establish provenance, and it is a sentence a real person actually said. The
embedding already exists; keeping the words adds nothing and retains more.

Also not stored: any contact detail. There is no email, phone, or address field,
and one must not be added without revisiting this ADR.

## Consequence: `comfy-files.ts` stops being delete-only

ADR-004 gave that module a deliberately narrow posture, stated in its own header:

> Deleting is the only mutation offered. There is no write, no move, no
> read-arbitrary-file.

**That sentence is no longer true, and this ADR is the record of why.** Writing
and reading a sidecar requires both operations on the engine's disk.

The posture is narrowed back by construction rather than by promise:

1. The sidecar path is derived **only** from a voice id that already passed
   `voiceFilePath`'s `^[a-zA-Z0-9_-]+\.safetensors$` shape check — the id cannot
   express a traversal, and the `.json` name is built by this module, never
   supplied by the caller.
2. Callers validate the id against the **engine's own list** before the
   filesystem layer is reached, exactly as the delete route already does. An id
   that is not a real voice never gets a path built for it.
3. Reads and writes reach `PROMPTS_DIR` only. `OUTPUT_DIR` and `INPUT_DIR` stay
   delete-only; nothing in this ADR grants write access to either.
4. The write is whole-file JSON of a validated shape. There is no append, no
   partial write, no path chosen by the client.

Traversal tests cover the write path at the same standard the delete path is
held to.

## Consequences

**Good**
- Phase 2's provenance criterion is met with a record that outlives the browser.
- Display names recover their accents, which the slug destroyed.
- Provenance can be added to voices that predate the feature.

**Bad, and accepted**
- There are now two files per voice that can drift. The reconciliation rule
  above bounds the damage to "a decoration is missing or stale", never "a voice
  is wrong or invented".
- The app writes to the engine's model directory. It already deleted from it
  (ADR-004); this widens the surface, and §"Consequence" above is how that is
  contained.
- A user who moves a `.safetensors` by hand and leaves the `.json` behind gets a
  voice with no provenance. That is the honest outcome and the UI says so.

## Alternatives rejected

- **Re-reading provenance from the audio file.** There is no audio file; ADR-004
  deletes it. Keeping it to serve as its own record was rejected in session 2 and
  is not reopened here.
- **Embedding provenance inside the `.safetensors`.** The file is written by
  `Qwen3SavePrompt`, which this app does not control. Post-processing a model
  file the engine owns to smuggle metadata into it is a far worse coupling than
  a sidecar the engine ignores by construction.
