/**
 * Reaching ComfyUI's own files. See ADR-004.
 *
 * WHY THIS EXISTS AT ALL
 *   ADR-001 established that the app talks to ComfyUI over HTTP, always from
 *   the server. That covers everything except one thing the engine simply does
 *   not offer: DELETING a file. Its only DELETE route is `/userdata/{file}`,
 *   scoped to its `user/` directory — not `output/`, not `models/`. Verified
 *   against server.py and app/user_manager.py, not assumed.
 *
 *   So "delete this take" and "delete this voice" cannot be asked of the
 *   engine. They are done here, on the filesystem, by the server.
 *
 * THE SECURITY POSTURE
 *   Every path this module builds comes from data that reached us through the
 *   browser, so nothing is trusted:
 *     1. Only three directories are reachable at all, and they are derived from
 *        one configured root — never from a client-supplied path.
 *     2. Every resolved path is proven to sit INSIDE its allowed directory
 *        before any operation, so `..` cannot escape.
 *     3. The mutations offered are exactly two, and both are narrow: DELETE a
 *        file, and READ/WRITE a voice's provenance sidecar. There is no move,
 *        no append, and no read-arbitrary-file. The sidecar name is BUILT here
 *        from an already-validated voice id — a caller never supplies it — and
 *        it can only ever land in PROMPTS_DIR. See ADR-005, which records why
 *        this module stopped being delete-only.
 *
 * Server-only: it touches `node:fs`.
 */

import { readFile, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { statSync } from "node:fs";
import path from "node:path";

/**
 * Where ComfyUI lives on disk.
 *
 * ComfyUI does not report this over HTTP — `/system_stats` returns versions and
 * hardware, never paths — so it has to be configured. The default matches the
 * comfy-cli convention (`~/comfy`), which is where this machine's install sits.
 */
export const COMFY_ROOT = process.env.COMFY_ROOT ?? path.join(homedir(), "comfy");

/** The directories this module may ever touch. Nothing else is reachable. */
const OUTPUT_DIR = path.join(COMFY_ROOT, "output");
const PROMPTS_DIR = path.join(COMFY_ROOT, "models", "Qwen3-TTS", "prompts");
const INPUT_DIR = path.join(COMFY_ROOT, "input");

export class UnsafePathError extends Error {}
export class MissingFileError extends Error {}

/**
 * Resolve `segments` under `base`, and prove the result stayed inside it.
 *
 * `path.resolve` is what makes `..` dangerous and also what makes it
 * detectable: it collapses the traversal, and then the prefix check sees where
 * the path really landed. The trailing separator matters — without it,
 * `/output-evil` would pass a naive `startsWith('/output')`.
 */
function resolveInside(base: string, ...segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  const fence = base.endsWith(path.sep) ? base : base + path.sep;
  if (resolved !== base && !resolved.startsWith(fence)) {
    throw new UnsafePathError("La ruta apunta fuera del directorio permitido.");
  }
  return resolved;
}

/**
 * The absolute path of a generated audio file.
 *
 * `type` is checked rather than used: ComfyUI labels files input/output/temp,
 * and only an output is ours to delete. An input is somebody's reference
 * recording and a temp is the engine's business.
 */
export function outputFilePath({
  filename,
  subfolder = "",
  type = "output",
}: {
  filename: string;
  subfolder?: string;
  type?: string;
}): string {
  if (type !== "output") {
    throw new UnsafePathError(`Solo se pueden borrar archivos de salida, no de tipo "${type}".`);
  }
  if (!filename || filename.includes("\0")) {
    throw new UnsafePathError("Nombre de archivo inválido.");
  }
  return resolveInside(OUTPUT_DIR, subfolder, filename);
}

/**
 * The absolute path of a saved voice embedding.
 *
 * The id is not merely pattern-checked, it is checked against the engine's own
 * list by the caller — see the delete route. Belt and braces: the shape check
 * here means a traversal cannot be expressed even if that lookup were skipped.
 */
export function voiceFilePath(voiceId: string): string {
  if (!/^[a-zA-Z0-9_-]+\.safetensors$/.test(voiceId)) {
    throw new UnsafePathError("Identificador de voz inválido.");
  }
  return resolveInside(PROMPTS_DIR, voiceId);
}

/**
 * The absolute path of a reference clip sitting in ComfyUI's input directory.
 *
 * This exists so a reference recording can be removed once the voice embedding
 * has been computed from it. The clip is a real person's voice — personal data
 * that has served its purpose the moment the .safetensors exists — and CLAUDE.md
 * § Retention is explicit that intermediates holding personal data get purged
 * when the task is done.
 *
 * ⚠️ The input directory is NOT ours. It holds files the user put there
 * themselves, long before this app existed. Only a name the app just uploaded
 * is ever passed here, and the caller is the registration flow, never the user.
 */
export function referenceFilePath(filename: string): string {
  if (!filename || filename.includes("\0")) {
    throw new UnsafePathError("Nombre de archivo inválido.");
  }
  return resolveInside(INPUT_DIR, filename);
}

/**
 * Delete a file, treating "it was already gone" as success.
 *
 * The user asked for the file not to exist. If it does not exist, that is the
 * outcome they wanted, and reporting a failure would only invite them to try
 * again at something that is already done.
 */
export async function deleteFile(absolutePath: string): Promise<void> {
  try {
    await unlink(absolutePath);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return;
    if (code === "EPERM" || code === "EACCES") {
      throw new Error("El sistema no dejó borrar el archivo (permisos o está en uso).");
    }
    if (code === "EBUSY") {
      throw new Error("El archivo está en uso ahora mismo. Ciérralo y prueba otra vez.");
    }
    throw cause;
  }
}

/**
 * The absolute path of a voice's provenance sidecar. See ADR-005.
 *
 * ⚠️ The caller does NOT get to name this file. It is derived from the voice
 * id — which has already been proven to match `^[a-zA-Z0-9_-]+\.safetensors$`
 * by `voiceFilePath`, and which callers additionally check against the engine's
 * own list — by swapping the extension. A traversal cannot be expressed through
 * that id, so it cannot be expressed here either.
 */
export function voiceSidecarPath(voiceId: string): string {
  // Reuse the voice check rather than restating it: one shape rule, in one
  // place, so the two files can never disagree about what a valid id is.
  voiceFilePath(voiceId);
  return resolveInside(PROMPTS_DIR, voiceId.replace(/\.safetensors$/i, ".json"));
}

/**
 * The absolute path of a joined narration piece — where
 * `execution/tts_unir_tramos.py`'s `--unir` mode is told to write, Fase 3
 * (guiones largos). Amends ADR-004; the amendment itself is ADR-007 § D3.
 * The segments themselves are written by the existing
 * `submit()`/`statusOf()` path through ComfyUI, same as any other take —
 * only the JOINED piece is new, and Python writes it.
 *
 * WHY THE SERVER STILL PICKS THE PATH, NOT THE SCRIPT
 *   ADR-004's real invariant was never "no script writes a file" — it was
 *   that exactly ONE module decides which paths are legal, so a path can be
 *   proven safe in one place. A script that invented its own output location
 *   would be a second such module. Here the join route computes this path
 *   BEFORE ever invoking Python and passes it in as a plain argument; the
 *   script is a transformer that writes where it is told and nowhere it
 *   picked itself. The invariant survives; only who needs a *write* target
 *   changes.
 *
 * ⚠️ The caller does NOT get to name this file — same trust rule as
 * `voiceSidecarPath`. `id` is generated on the SERVER (the join route uses
 * `crypto.randomUUID()`); a browser only ever supplies the segment list that
 * produces a piece, and every one of those paths is validated by
 * `outputFilePath` before this function is ever reached.
 */
export function pieceOutputPath(id: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    throw new UnsafePathError("Identificador de pieza inválido.");
  }
  return resolveInside(OUTPUT_DIR, `ttsstudio_pieza_${id}.flac`);
}

/**
 * Read a sidecar. Absent, unreadable or malformed all mean the same thing:
 * `null`.
 *
 * The engine's list is the voice library (ADR-005), so a bad sidecar must cost
 * a decoration and nothing else. Throwing here would let one hand-edited file
 * take down the whole library, which is a much worse outcome than a voice
 * showing as undocumented.
 */
export async function readSidecar(absolutePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(absolutePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Write a sidecar.
 *
 * Whole-file and pretty-printed: it sits in the user's own model directory
 * where they may well open it, and a record about a person should be readable
 * by that person. Unlike `readSidecar`, a failure here IS reported — the user
 * pressed save and has a right to know it did not save.
 */
export async function writeSidecar(absolutePath: string, data: unknown): Promise<void> {
  try {
    await writeFile(absolutePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException).code;
    if (code === "EPERM" || code === "EACCES") {
      throw new Error("El sistema no dejó guardar la procedencia (permisos).");
    }
    if (code === "ENOENT") {
      throw new Error(
        "No existe el directorio de voces del motor. ¿COMFY_ROOT apunta al sitio correcto?",
      );
    }
    throw cause;
  }
}

/** Where the engine keeps its Qwen3-TTS checkpoints. */
const MODELS_DIR = path.join(COMFY_ROOT, "models", "Qwen3-TTS");

/**
 * Is a given engine checkpoint actually on disk?
 *
 * WHY IT EXISTS: the pack's loader lists every checkpoint it KNOWS ABOUT,
 * downloaded or not, so `object_info` cannot answer this. The nine preset
 * speakers need `Qwen3-TTS-12Hz-1.7B-CustomVoice`, a different (and separately
 * downloaded) model from the `-Base` one cloning uses. Offering those voices
 * without it produced the engine's own "incompatible model" error at
 * generation time — a promise the interface could not keep, which is exactly
 * what PRODUCT.md's second principle forbids.
 *
 * A directory check, not a deep validation: it answers "has this been
 * downloaded", not "is it intact". A half-downloaded model would pass here and
 * fail later, and that gap is stated rather than papered over.
 */
export function hasEngineModel(folderName: string): boolean {
  try {
    return statSync(resolveInside(MODELS_DIR, folderName)).isDirectory();
  } catch {
    return false;
  }
}

/** The checkpoint the nine preset speakers live inside. */
export const CUSTOM_VOICE_MODEL_DIR = "Qwen3-TTS-12Hz-1.7B-CustomVoice";

/** For diagnostics and the delete routes' error messages. */
export const DIRECTORIES = { COMFY_ROOT, OUTPUT_DIR, PROMPTS_DIR, INPUT_DIR } as const;

/**
 * Strip the engine root out of a message before it reaches the browser.
 *
 * WHY: the Python scripts name the file they failed on, absolute path and
 * all, and `runScriptJson` relays that text verbatim into a 502 body. That
 * turns a missing-file error into a disclosure of the OS username and the
 * disk layout (`C:\Users\<someone>\comfy\output\...`). The diagnostic is
 * worth keeping; the prefix is not, because the only reader who needs it is
 * on this machine and can read the server log.
 *
 * Case-insensitive because Windows paths compare that way, and the separator
 * is normalised first so a message carrying forward slashes is still caught.
 */
export function redactRoot(message: string): string {
  const normalised = message.replace(/\//g, path.sep);
  const root = COMFY_ROOT.replace(/\//g, path.sep);
  return normalised.replaceAll(
    new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
    "<motor>",
  );
}
