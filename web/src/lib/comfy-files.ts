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
 *     1. Only two directories are reachable at all, and they are derived from
 *        one configured root — never from a client-supplied path.
 *     2. Every resolved path is proven to sit INSIDE its allowed directory
 *        before any operation, so `..` cannot escape.
 *     3. Deleting is the only mutation offered. There is no write, no move,
 *        no read-arbitrary-file.
 *
 * Server-only: it touches `node:fs`.
 */

import { unlink } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Where ComfyUI lives on disk.
 *
 * ComfyUI does not report this over HTTP — `/system_stats` returns versions and
 * hardware, never paths — so it has to be configured. The default matches the
 * comfy-cli convention (`~/comfy`), which is where this machine's install sits.
 */
export const COMFY_ROOT = process.env.COMFY_ROOT ?? path.join(homedir(), "comfy");

/** The two directories this module may ever touch. Nothing else is reachable. */
const OUTPUT_DIR = path.join(COMFY_ROOT, "output");
const PROMPTS_DIR = path.join(COMFY_ROOT, "models", "Qwen3-TTS", "prompts");

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

/** For diagnostics and the delete routes' error messages. */
export const DIRECTORIES = { COMFY_ROOT, OUTPUT_DIR, PROMPTS_DIR } as const;
