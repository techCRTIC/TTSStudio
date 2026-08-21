# ADR-004 — The app deletes ComfyUI's files directly

**Status:** Accepted — 2026-08-21 (session 2)
**Deciders:** user (asked for real deletion), orchestrator (verified the engine cannot do it)
**Related:** ADR-001 (which this amends), roadmap Phase 2

## Context

The user asked for two deletions, and was explicit about what "delete" means:
*"se borraría realmente del disco cierto? eso quiero."*

1. **A voice** — `models/Qwen3-TTS/prompts/<slug>.safetensors`
2. **A take** — the generated audio in `output/`

ADR-001 settled that the app talks to ComfyUI over HTTP, always server-side.
Every feature so far has fitted inside that: submit a graph, poll history, read
the queue, upload a reference clip, view a file.

**Deletion does not fit, and this was verified rather than assumed.** ComfyUI's
entire HTTP surface was searched for a delete route. There is exactly one:

```python
@routes.delete("/userdata/{file}")        # app/user_manager.py:427
```

It is scoped to `folder_paths.get_user_directory()` — the engine's `user/`
folder, which holds saved workflows and settings. It cannot reach `output/` and
it cannot reach `models/`. `/system_stats` was also checked, in case the engine
at least *declares* its paths: it returns versions and hardware, never a path.

So there were three options:

| Option | Verdict |
|---|---|
| Ask ComfyUI to delete | **Impossible.** No such route exists. |
| Leave files forever, hide entries | Rejected: the user asked for the file to be gone, and an app that says "deleted" while the disk fills up is lying. |
| **Delete from the server, on the filesystem** | Chosen. |

## Decision

**The Next server deletes files in ComfyUI's directories directly, through one
module — `web/src/lib/comfy-files.ts` — which is the only place in the app that
touches `node:fs`.**

ADR-001 is amended, not overturned: *everything the engine can do over HTTP is
still done over HTTP.* The filesystem is used only for the one operation the
engine does not expose.

## Where ComfyUI is

`COMFY_ROOT`, defaulting to `~/comfy` — the comfy-cli convention, and where this
machine's install actually sits (confirmed against `server_info`). Verified at
runtime: the default resolved correctly with no configuration.

Only two directories are ever derived from it, and never from client input:

```
<root>/output                      — generated takes
<root>/models/Qwen3-TTS/prompts    — voice embeddings
```

## The security posture

Every path this module builds originates in data that came through the browser,
so nothing is trusted:

1. **Two directories, both derived from the configured root.** A client-supplied
   path is never used as a base.
2. **Every resolved path is proven to sit inside its directory** before any
   operation. `path.resolve` collapses `..`, and the prefix check — with the
   trailing separator, so `output-evil` cannot pass as `output` — sees where it
   really landed.
3. **Deleting is the only mutation offered.** No write, no move, no
   read-arbitrary-file.
4. **A voice id is checked against the engine's own list** before the filesystem
   layer is reached at all, so an id that is not a real voice never becomes a
   path. The shape check in `voiceFilePath` is the second lock.
5. **Only `type=output` is deletable.** An `input` is somebody's reference
   recording; a `temp` is the engine's business.

`web/tests/comfy-files.test.ts` covers the traversal shapes (posix and Windows
separators, absolute paths, null bytes, escaping subfolders) and asserts the
property directly: the resolved path is inside the allowed directory, or it
throws.

## Consequences

**Positive**
- Deleting means deleting. The disk actually shrinks.
- One module owns filesystem access, so the audit surface is one file.
- Voice deletion completes a Phase 2 deliverable the roadmap already required.

**Negative**
- **The app now depends on where ComfyUI is installed**, which HTTP alone never
  required. A moved or remote ComfyUI breaks deletion — and *only* deletion,
  since everything else still goes over HTTP. `COMFY_ROOT` is the escape hatch,
  and B-006's preflight is where this should be checked and reported.
- A remote ComfyUI (`COMFYUI_URL` pointing elsewhere) would make deletion
  silently wrong: the server would delete from a local path that is not the
  engine's. **Not handled today** — the product is single-machine by decision
  (PRODUCT.md), and building for a case that does not exist is speculation. It
  is written here so the next person meets it as a known limit, not a surprise.
- Deletion is irreversible and the UI is the only guard. Both call sites confirm
  in place before acting.

**Neutral**
- Under a future Tauri shell (B-005), filesystem access is native and this
  module is where that swap would happen.
